import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import {
    CardLegalityCache,
    isCardLegalityFresh,
    LEGALITY_CACHE_KEY,
    LEGALITY_TTL,
} from '../src/services/CardLegalityCache.ts'
import { ScryfallService } from '../src/services/ScryfallService.ts'

function memoryStorage(): Storage {
    const entries = new Map<string, string>()
    return {
        get length() {
            return entries.size
        },
        clear: () => entries.clear(),
        key: (position) => [...entries.keys()][position] ?? null,
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => {
            entries.set(key, value)
        },
        removeItem: (key) => {
            entries.delete(key)
        },
    }
}

test('daily cutoff invalidates pre-19:05 CET entries exactly at 18:05 UTC, in winter and summer', () => {
    for (const day of ['2026-01-15', '2026-07-15']) {
        const cutoff = Date.parse(`${day}T18:05:00Z`)
        const before = { name: 'Forest', legal: true, known: true, checkedAt: cutoff - 1 }
        assert.equal(isCardLegalityFresh(before, cutoff - 1), true)
        assert.equal(isCardLegalityFresh(before, cutoff), false)
        assert.equal(isCardLegalityFresh({ ...before, checkedAt: cutoff }, cutoff), true)
        assert.equal(isCardLegalityFresh({ ...before, known: false }, cutoff), false)
    }
})

test('post-cutoff entries survive midnight but expire at the next daily cutoff', () => {
    const entry = {
        name: 'Forest',
        legal: true,
        known: true,
        checkedAt: Date.parse('2026-10-20T18:10:00Z'),
    }
    assert.equal(isCardLegalityFresh(entry, Date.parse('2026-10-21T00:00:00Z')), true)
    assert.equal(isCardLegalityFresh(entry, Date.parse('2026-10-21T18:04:59.999Z')), true)
    assert.equal(isCardLegalityFresh(entry, Date.parse('2026-10-21T18:05:00Z')), false)
    assert.equal(
        isCardLegalityFresh({ ...entry, known: false }, entry.checkedAt + 60 * 60 * 1000),
        false
    )
})

test('daily cutoff applies to memory and persisted cache without requiring a full 24 hours', () => {
    const storage = memoryStorage()
    let now = Date.parse('2026-10-21T18:04:00Z')
    const cache = new CardLegalityCache(storage, () => now)
    cache.set('Forest', { name: 'Forest', legal: true, known: true, checkedAt: now })
    assert.ok(cache.get('Forest'))
    now = Date.parse('2026-10-21T18:05:00Z')
    assert.equal(cache.get('Forest'), undefined)
    assert.equal(new CardLegalityCache(storage, () => now).get('Forest'), undefined)
})

test('Scryfall is queried again after the daily cutoff without a forced refresh', async () => {
    let now = Date.parse('2026-10-21T18:04:00Z')
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    let requests = 0
    vi.stubGlobal('fetch', async () => {
        requests++
        return Response.json({
            name: 'Forest',
            legalities: { pauper: requests === 1 ? 'legal' : 'banned' },
        })
    })
    const service = new ScryfallService(new CardLegalityCache(memoryStorage()), 0)
    assert.equal((await service.lookup('Forest')).legal, true)
    now = Date.parse('2026-10-21T18:05:00Z')
    assert.equal((await service.lookup('Forest')).legal, false)
    assert.equal(requests, 2)
})

test('local cache survives service recreation, expires after 24h and tolerates invalid storage', () => {
    const storage = memoryStorage()
    let now = 1000
    const cache = new CardLegalityCache(storage, () => now)
    cache.set('Forest', { name: 'Forest', legal: true, known: true, checkedAt: now })
    assert.equal(new CardLegalityCache(storage, () => now).get('FOREST')?.legal, true)
    now += LEGALITY_TTL
    assert.equal(cache.get('Forest'), undefined)
    assert.equal(new CardLegalityCache(storage, () => now).get('Forest'), undefined)
    storage.setItem(LEGALITY_CACHE_KEY, '{broken')
    assert.equal(new CardLegalityCache(storage).get('Forest'), undefined)
})

test('cache remains functional when persistence fails', () => {
    const storage = memoryStorage()
    storage.setItem = () => {
        throw new Error('Quota exceeded')
    }
    const cache = new CardLegalityCache(storage)
    cache.set('Forest', { name: 'Forest', legal: true, known: true, checkedAt: Date.now() })
    assert.equal(cache.get('Forest')?.legal, true)
})

test('Scryfall receives one exact card per GET, no list, cookies or referrer; requests are deduplicated', async () => {
    const requests: { url: string; options: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
        requests.push({ url, options })
        return Response.json({ name: 'Forest', legalities: { pauper: 'legal' } })
    })
    const storage = memoryStorage()
    const service = new ScryfallService(new CardLegalityCache(storage), 0)
    await Promise.all([service.lookup('Forest'), service.lookup('forest')])
    await service.lookup('Forest')
    await new ScryfallService(new CardLegalityCache(storage), 0).lookup('Forest')
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'https://api.scryfall.com/cards/named?exact=Forest')
    assert.equal(requests[0].options.body, undefined)
    assert.equal(requests[0].options.credentials, 'omit')
    assert.equal(requests[0].options.referrerPolicy, 'no-referrer')
    assert.equal(requests[0].options.redirect, 'error')
    await service.lookup('Forest', true)
    assert.equal(requests.length, 2)
    await assert.rejects(service.lookup('4 Forest\n4 Island'), /single card/)
    assert.equal(requests.length, 2)
})

test('network errors and rate limits are not cached as illegal cards', async () => {
    let attempts = 0
    vi.stubGlobal('fetch', async () => {
        attempts++
        return attempts === 1
            ? new Response(null, { status: 429 })
            : Response.json({ name: 'Forest', legalities: { pauper: 'legal' } })
    })
    const service = new ScryfallService(new CardLegalityCache(null), 0)
    await assert.rejects(service.lookup('Forest'), /429/)
    assert.equal((await service.lookup('Forest')).legal, true)
    assert.equal(attempts, 2)
})

test('not found and illegal cards are cached distinctly from network failures', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
        url.includes('Missing')
            ? new Response(null, { status: 404 })
            : Response.json({ name: 'Sol Ring', legalities: { pauper: 'not_legal' } })
    )
    const service = new ScryfallService(new CardLegalityCache(null), 0)
    assert.equal((await service.lookup('Missing')).known, false)
    assert.deepEqual(
        {
            legal: (await service.lookup('Sol Ring')).legal,
            known: (await service.lookup('Sol Ring')).known,
        },
        { legal: false, known: true }
    )
})

test('failed forced refresh invalidates the old cache so retry must query Scryfall again', async () => {
    let attempts = 0
    vi.stubGlobal('fetch', async () => {
        attempts++
        return attempts === 2
            ? new Response(null, { status: 503 })
            : Response.json({
                  name: 'Forest',
                  legalities: { pauper: attempts === 1 ? 'legal' : 'banned' },
              })
    })
    const service = new ScryfallService(new CardLegalityCache(memoryStorage()), 0)
    assert.equal((await service.lookup('Forest')).legal, true)
    await assert.rejects(service.lookup('Forest', true), /503/)
    assert.equal((await service.lookup('Forest')).legal, false)
    assert.equal(attempts, 3)
})

test('cache tolerates a browser that denies access to localStorage', () => {
    vi.stubGlobal('localStorage', null)
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
            throw new Error('Storage denied')
        },
    })
    const cache = new CardLegalityCache()
    cache.set('Forest', { name: 'Forest', legal: true, known: true, checkedAt: Date.now() })
    assert.equal(cache.get('Forest')?.legal, true)
})

test('cache evicts oldest entries at capacity and prunes expired entries on write', () => {
    let now = Date.parse('2026-10-21T12:00:00Z')
    const cache = new CardLegalityCache(null, () => now)
    for (let position = 0; position <= 1000; position++) {
        const name = `Card ${position}`
        cache.set(name, { name, legal: true, known: true, checkedAt: now })
    }
    assert.equal(cache.get('Card 0'), undefined)
    assert.ok(cache.get('Card 1000'))
    now += LEGALITY_TTL
    cache.set('Forest', { name: 'Forest', legal: true, known: true, checkedAt: now })
    assert.equal(cache.get('Card 1000'), undefined)
    assert.equal(cache.get('Forest')?.legal, true)
})

test('malformed Scryfall payloads are rejected and never cached as valid card data', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ name: 'Forest', legalities: null }))
    const cache = new CardLegalityCache(null)
    const service = new ScryfallService(cache, 0)
    await assert.rejects(service.lookup('Forest'), /Invalid Scryfall/)
    assert.equal(cache.get('Forest'), undefined)
})
