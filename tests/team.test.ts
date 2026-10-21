import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { createPinia, disposePinia } from 'pinia'
import { PublicDataService } from '../src/services/PublicDataService.ts'
import { FileDownloadService } from '../src/services/FileDownloadService.ts'
import { useTeamStore } from '../src/stores/team.ts'
import { LEGALITY_TTL } from '../src/services/CardLegalityCache.ts'
import { ScryfallService } from '../src/services/ScryfallService.ts'

function cardResponse(url: string): Response {
    if (url === '/art-credit.json')
        return Response.json({ card: 'Crop Rotation', artist: 'Artist' })
    const name = new URL(url).searchParams.get('exact')
    return Response.json({
        name,
        legalities: { pauper: name === 'Sol Ring' ? 'not_legal' : 'legal' },
    })
}
const piniaInstances: ReturnType<typeof createPinia>[] = []

function createStore() {
    const pinia = createPinia()
    piniaInstances.push(pinia)
    return useTeamStore(pinia)
}

afterEach(() => {
    for (const pinia of piniaInstances.splice(0)) disposePinia(pinia)
    vi.useRealTimers()
})

test('download service creates a local text Blob and revokes its URL after the download', () => {
    vi.useFakeTimers()
    const anchor = { href: '', download: '', click: vi.fn() }
    const createElement = vi.fn((_tag: string) => anchor)
    vi.stubGlobal('document', { createElement })
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-export')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    new FileDownloadService().save('team.txt', '# Team\n')
    assert.equal(createElement.mock.calls[0]?.[0], 'a')
    assert.equal(anchor.href, 'blob:local-export')
    assert.equal(anchor.download, 'team.txt')
    assert.equal(anchor.click.mock.calls.length, 1)
    const blob = createUrl.mock.calls[0][0]
    assert.ok(blob instanceof Blob)
    assert.equal(blob.type, 'text/plain;charset=utf-8')
    vi.advanceTimersByTime(999)
    assert.equal(revokeUrl.mock.calls.length, 0)
    vi.advanceTimersByTime(1)
    assert.deepEqual(revokeUrl.mock.calls[0], ['blob:local-export'])
})

test('download service still releases its Blob URL if clicking the anchor fails', () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', {
        createElement: () => ({
            click: () => {
                throw new Error('Download blocked')
            },
        }),
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:blocked')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    assert.throws(() => new FileDownloadService().save('team.txt', 'Deck'), /Download blocked/)
    vi.advanceTimersByTime(1000)
    assert.deepEqual(revokeUrl.mock.calls[0], ['blob:blocked'])
})

test('store exposes empty, pending, invalid, unknown, error and complete presentation states', async () => {
    const lookup = vi
        .spyOn(ScryfallService.prototype, 'lookup')
        .mockImplementation(async (name) => ({
            name,
            legal: name !== 'Sol Ring' && name !== 'Missing',
            known: name !== 'Missing',
            checkedAt: Date.now(),
        }))
    const store = createStore()
    assert.match(store.verificationTitle, /prossimo passo/)
    assert.match(store.verificationMessage, /A, B, C/)
    assert.equal(store.deckViews[0].status, 'In attesa')
    store.updatePlayer(99, { name: 'Ignored' })
    assert.equal(store.players.length, 3)
    store.updatePlayer(0, { text: '59 Forest\nSIDEBOARD:\n16 Island', link: 'not-a-url' })
    assert.equal(store.deckViews[0].status, 'Verifica in corso')
    assert.match(store.verificationTitle, /sovrapposizione/)
    assert.match(store.verificationMessage, /in corso/)
    assert.equal(store.prepareExport(), null)
    const verification = store.verifyCards()
    assert.match(store.deckViews[0].sections[0].cards[0].tooltip, /in corso/)
    await verification
    assert.equal(store.deckViews[0].status, 'Da verificare')
    assert.equal(store.deckViews[0].linkInvalid, true)
    assert.match(store.deckViews[0].sizeWarning, /16\/15/)
    assert.equal(store.deckViews[0].editorInvalid, true)
    store.updatePlayer(0, { text: '60 Forest\ninvalid line' })
    await store.verifyCards()
    assert.equal(store.deckViews[0].editorInvalid, true)
    store.updatePlayer(0, { text: '60 Missing' })
    await store.verifyCards()
    assert.match(store.deckViews[0].sections[0].cards[0].tooltip, /non trovata/)
    lookup.mockRejectedValueOnce(new Error('Offline'))
    store.updatePlayer(0, { text: '60 Forest' })
    await store.verifyCards()
    assert.match(store.verificationMessage, /non sono verificabili/)
    assert.match(store.deckViews[0].sections[0].cards[0].tooltip, /non disponibile/)
    for (const [seat, name] of ['Forest', 'Island', 'Mountain'].entries())
        store.updatePlayer(seat, { text: `60 ${name}` })
    await store.verifyCards()
    assert.match(store.verificationTitle, /pronto/)
    assert.match(store.verificationMessage, /Completa il nome/)
    store.teamName = '!!!'
    for (const seat of [0, 1, 2]) store.updatePlayer(seat, { name: `Player ${seat}` })
    assert.match(store.verificationMessage, /pronto per esportare/)
    assert.equal(store.prepareExport()?.filename, 'team-pauper.txt')
    store.updatePlayer(0, { text: '60 Sol Ring' })
    await store.verifyCards()
    assert.match(store.verificationMessage, /Risolvi gli avvisi/)
})

test('store debounces edits, refreshes expired legalities automatically and clears notifications', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T18:03:00Z'))
    const lookup = vi
        .spyOn(ScryfallService.prototype, 'lookup')
        .mockImplementation(async (name) => ({
            name,
            legal: true,
            known: true,
            checkedAt: Date.now(),
        }))
    const store = createStore()
    store.updatePlayer(0, { text: '60 Forest' })
    await vi.advanceTimersByTimeAsync(399)
    assert.equal(lookup.mock.calls.length, 0)
    await vi.advanceTimersByTimeAsync(1)
    assert.equal(lookup.mock.calls.length, 1)
    assert.equal(store.checking, false)
    await vi.advanceTimersByTimeAsync(59_600)
    assert.equal(lookup.mock.calls.length, 1)
    await vi.advanceTimersByTimeAsync(60_000)
    assert.equal(store.checking, true)
    await vi.advanceTimersByTimeAsync(400)
    assert.equal(lookup.mock.calls.length, 2)
    assert.equal(store.deckViews[0].valid, true)
    store.notify('Updated')
    await vi.advanceTimersByTimeAsync(3999)
    assert.equal(store.toast, 'Updated')
    await vi.advanceTimersByTimeAsync(1)
    assert.equal(store.toast, '')
})

test('reset discards late network failures and in-flight checks do not trigger duplicate expiry refreshes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    let rejectRequest: (error: Error) => void = () => {}
    const request = new Promise<never>((_, reject) => {
        rejectRequest = reject
    })
    const lookup = vi.spyOn(ScryfallService.prototype, 'lookup').mockReturnValue(request)
    const store = createStore()
    store.updatePlayer(0, { text: '60 Forest' })
    const verification = store.verifyCards()
    await vi.advanceTimersByTimeAsync(60_000)
    assert.equal(lookup.mock.calls.length, 1)
    store.reset()
    rejectRequest(new Error('Late failure'))
    await verification
    assert.equal(store.verificationError, false)
    assert.equal(store.loadedCount, 0)
})

test('store initializes once and checks only individual card names without sending team data', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
        requests.push(url)
        return cardResponse(url)
    })
    const store = createStore()
    await Promise.all([store.initialize(), store.initialize()])
    assert.deepEqual(requests, ['/art-credit.json'])
    assert.equal(store.checking, false)
    assert.equal(store.artCredit?.card, 'Crop Rotation')
    for (const [seat, card] of ['Forest', 'Island', 'Mountain'].entries())
        store.updatePlayer(seat, { text: `60 ${card}` })
    assert.equal(store.prepareExport(), null)
    await store.verifyCards()
    assert.equal(store.result.valid, true)
    assert.equal(store.validCount, 3)
    assert.equal(store.prepareExport(), null)
    store.teamName = 'Private Team'
    for (const seat of [0, 1, 2]) store.updatePlayer(seat, { name: `Player ${seat}` })
    const exported = store.prepareExport()
    assert.equal(exported?.filename, 'Private-Team-pauper.txt')
    assert.match(exported?.text ?? '', /## A: Player 0/)
    store.updatePlayer(1, { text: '60 Island\nSIDEBOARD:\n1 Forest' })
    await store.verifyCards()
    assert.equal(store.prepareExport(), null)
    assert.equal(store.conflicts[0].seatsLabel, 'A / B')
    assert.equal(
        store.deckViews[0].sections[0].cards[0].conflict?.color,
        store.deckViews[1].sections[1].cards[0].conflict?.color
    )
    assert.match(store.deckViews[0].sections[0].cards[0].tooltip, /Carta condivisa/)
    store.updatePlayer(2, {
        text: '60 Sol Ring',
        link: 'https://moxfield.com/decks/secret',
        source: 'moxfield',
    })
    await store.verifyCards()
    assert.equal(store.deckViews[2].sections[0].cards[0].illegal, true)
    assert.equal(store.deckViews[2].linkInvalid, false)
    assert.equal(requests.length, 5)
    assert.ok(requests.slice(1).every((url) => new URL(url).origin === 'https://api.scryfall.com'))
})

test('store blocks export on Scryfall failure and recovers on retry', async () => {
    let available = false
    vi.stubGlobal('fetch', async (url: string) =>
        available ? cardResponse(url) : new Response(null, { status: 503 })
    )
    const store = createStore()
    await store.initialize()
    store.updatePlayer(0, { text: '60 Forest' })
    await store.verifyCards()
    assert.equal(store.verificationError, true)
    assert.equal(store.artCredit, null)
    assert.equal(store.cardIndex.size, 0)
    assert.equal(store.deckViews[0].sections[0].cards[0].illegal, false)
    assert.equal(store.prepareExport(), null)
    available = true
    await store.verifyCards()
    assert.equal(store.verificationError, false)
    assert.equal(store.checking, false)
    assert.ok(store.cardIndex.has('forest'))
})

test('store reset clears private fields while preserving reusable card information', async () => {
    vi.stubGlobal('fetch', async (url: string) => cardResponse(url))
    const store = createStore()
    await store.initialize()
    store.teamName = 'Secret Team'
    store.updatePlayer(0, {
        name: 'Private Player',
        text: '60 Forest',
        source: 'moxfield',
        link: 'https://moxfield.com/decks/secret',
    })
    await store.verifyCards()
    store.clearDeck(0)
    assert.equal(store.players[0].text, '')
    assert.equal(store.players[0].name, 'Private Player')
    store.reset()
    assert.equal(store.teamName, '')
    assert.ok(
        store.players.every(
            (player) => !player.name && !player.text && !player.link && player.source === 'text'
        )
    )
    assert.deepEqual(
        store.players.map((player) => player.seat),
        ['A', 'B', 'C']
    )
    assert.equal(store.loadedCount, 0)
    assert.ok(store.cardIndex)
})

test('public data service rejects invalid artwork responses', async () => {
    const service = new PublicDataService()
    vi.stubGlobal('fetch', async () => Response.json({ cards: [['Forest', 'legal']] }))
    await assert.rejects(service.loadArtCredit(), /Invalid artwork credit/)
})

test('store permits the download service only for a complete conforming team', async () => {
    vi.stubGlobal('fetch', async (url: string) => cardResponse(url))
    const files: { filename: string; text: string }[] = []
    vi.spyOn(FileDownloadService.prototype, 'save').mockImplementation(
        (filename: string, text: string) => files.push({ filename, text })
    )
    const store = createStore()
    store.download()
    assert.equal(files.length, 0)
    await store.initialize()
    for (const [seat, card] of ['Forest', 'Island', 'Mountain'].entries())
        store.updatePlayer(seat, { text: `60 ${card}`, name: `Player ${seat}` })
    await store.verifyCards()
    store.download()
    assert.equal(files.length, 0)
    store.teamName = 'Ready Team'
    store.download()
    assert.equal(files.length, 1)
    assert.equal(files[0].filename, 'Ready-Team-pauper.txt')
    assert.match(files[0].text, /## C: Player 2/)
    assert.equal(store.toast, 'Le tre liste sono state esportate.')
})

test('artwork service sends only a fixed same-origin GET without private payloads', async () => {
    const requests: { url: string; options: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
        requests.push({ url, options })
        return cardResponse(url)
    })
    const service = new PublicDataService()
    await service.loadArtCredit()
    assert.deepEqual(
        requests.map((request) => request.url),
        ['/art-credit.json']
    )
    for (const { options } of requests) {
        assert.equal(options.credentials, 'omit')
        assert.equal(options.body, undefined)
        assert.equal(options.method, undefined)
    }
})

test('artwork service respects the GitHub Pages repository base path', async () => {
    let requestedUrl = ''
    vi.stubGlobal('fetch', async (url: string) => {
        requestedUrl = url
        return Response.json({ card: 'Crop Rotation', artist: 'Artist' })
    })
    await new PublicDataService('/vue-team-trio/').loadArtCredit()
    assert.equal(requestedUrl, '/vue-team-trio/art-credit.json')
})

test('forced refresh bypasses cache and immediately blocks previously valid export', async () => {
    let legal = true
    vi.stubGlobal('fetch', async (url: string) =>
        url.startsWith('/')
            ? cardResponse(url)
            : Response.json({
                  name: new URL(url).searchParams.get('exact'),
                  legalities: { pauper: legal ? 'legal' : 'banned' },
              })
    )
    const store = createStore()
    for (const [seat, name] of ['Forest', 'Island', 'Mountain'].entries())
        store.updatePlayer(seat, { text: `60 ${name}`, name })
    store.teamName = 'Team'
    await store.verifyCards()
    assert.equal(store.canExport, true)
    legal = false
    const verification = store.verifyCards(true)
    assert.equal(store.prepareExport(), null)
    await verification
    assert.equal(store.canExport, false)
    assert.ok(store.deckViews.every((deck) => deck.sections[0].cards[0].illegal))
})

test('late responses for an edited or reset deck never restore stale validation', async () => {
    let release: (response: Response) => void = () => {}
    const gate = new Promise<Response>((resolve) => {
        release = resolve
    })
    vi.stubGlobal('fetch', async (url: string) =>
        url.includes('Forest') ? gate : cardResponse(url)
    )
    const store = createStore()
    store.updatePlayer(0, { text: '60 Forest' })
    const oldRequest = store.verifyCards()
    await Promise.resolve()
    store.updatePlayer(0, { text: '60 Island' })
    const newRequest = store.verifyCards()
    release(cardResponse('https://api.scryfall.com/cards/named?exact=Forest'))
    await Promise.all([oldRequest, newRequest])
    assert.equal(store.deckViews[0].sections[0].cards[0].name, 'Island')
    assert.equal(store.cardIndex.has('forest'), false)
    store.reset()
    assert.equal(store.loadedCount, 0)
    assert.equal(store.prepareExport(), null)
})

for (const scenario of [
    {
        reason: '24-hour TTL',
        checkedAt: Date.parse('2026-10-21T18:10:00Z'),
        expiresAt: Date.parse('2026-10-21T18:10:00Z') + LEGALITY_TTL + 1,
    },
    {
        reason: 'daily 19:05 CET cutoff',
        checkedAt: Date.parse('2026-10-21T18:04:00Z'),
        expiresAt: Date.parse('2026-10-21T18:05:00Z'),
    },
]) {
    test(`expired card information cannot be exported and is revalidated before export: ${scenario.reason}`, async () => {
        let now = scenario.checkedAt
        vi.spyOn(Date, 'now').mockImplementation(() => now)
        let requests = 0
        vi.stubGlobal('fetch', async (url: string) => {
            requests++
            return cardResponse(url)
        })
        const store = createStore()
        store.teamName = 'Ready Team'
        for (const [seat, name] of ['Forest', 'Island', 'Mountain'].entries())
            store.updatePlayer(seat, { name, text: `60 ${name}` })
        await store.verifyCards()
        assert.equal(store.canExport, true)
        assert.equal(requests, 3)
        now = scenario.expiresAt
        assert.equal(store.prepareExport(), null)
        assert.equal(store.checking, true)
        await store.verifyCards()
        assert.equal(requests, 6)
        assert.equal(store.canExport, true)
    })
}
