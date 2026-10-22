import { normalizeName } from '../domain'
import { CardLegalityCache } from './CardLegalityCache'
import type { CardLegality } from './CardLegalityCache'

export class ScryfallService {
    private readonly pending = new Map<string, Promise<CardLegality>>()
    private queue: Promise<void> = Promise.resolve()
    private lastRequestAt = 0
    private blockedUntil = 0

    constructor(
        private readonly cache = new CardLegalityCache(),
        private readonly intervalMs = 500,
        private readonly retryDelayMs = 2000,
        private readonly maxRetries = 2
    ) {}

    private retryDelay(response: Response | null, attempt: number): number {
        const retryAfter = response?.headers.get('Retry-After')
        const seconds = retryAfter ? Number(retryAfter) : NaN
        const retryAt = retryAfter ? Date.parse(retryAfter) : NaN
        const serverDelay = Number.isFinite(seconds)
            ? seconds * 1000
            : Number.isFinite(retryAt)
              ? retryAt - Date.now()
              : 0
        return Math.max(this.retryDelayMs * 2 ** attempt, serverDelay)
    }

    private async request(url: string): Promise<Response> {
        if (Date.now() < this.blockedUntil)
            throw new Error('Scryfall temporarily paused; retry later')
        for (let attempt = 0; ; attempt++) {
            const wait = this.intervalMs - (Date.now() - this.lastRequestAt)
            if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait))
            this.lastRequestAt = Date.now()
            let response: Response | null = null
            try {
                response = await fetch(url, {
                    headers: { Accept: 'application/json' },
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                    redirect: 'error',
                    cache: 'no-store',
                    signal: AbortSignal.timeout(15_000),
                })
            } catch (error) {
                if (!(error instanceof TypeError)) throw error
            }
            if (response && response.status !== 429) return response
            const delay = this.retryDelay(response, attempt)
            if (attempt >= this.maxRetries) {
                this.blockedUntil = Date.now() + delay
                throw new Error(
                    response
                        ? 'Scryfall unavailable (429); retry later'
                        : 'Scryfall network or CORS failure; retry later'
                )
            }
            await new Promise<void>((resolve) => setTimeout(resolve, delay))
        }
    }

    lookup(name: string, force = false): Promise<CardLegality> {
        const cleanName = name.trim()
        if (!cleanName || cleanName.length > 200 || /[\r\n\t\x00-\x1f]/.test(cleanName))
            return Promise.reject(new Error('Invalid single card name'))
        const key = normalizeName(cleanName)
        const pending = this.pending.get(key)
        if (pending) return pending
        if (force) this.cache.delete(cleanName)
        const cached = force ? undefined : this.cache.get(cleanName)
        if (cached) return Promise.resolve(cached)
        const request = this.queue.then(async () => {
            const url = new URL('https://api.scryfall.com/cards/named')
            url.searchParams.set('exact', cleanName)
            const response = await this.request(url.toString())
            let result: CardLegality
            if (response.status === 404) {
                result = { name: cleanName, legal: false, known: false, checkedAt: Date.now() }
            } else {
                if (!response.ok) throw new Error(`Scryfall unavailable (${response.status})`)
                const data: unknown = await response.json()
                if (
                    typeof data !== 'object' ||
                    data === null ||
                    !('name' in data) ||
                    typeof data.name !== 'string' ||
                    !data.name ||
                    data.name.length > 200 ||
                    !('legalities' in data) ||
                    typeof data.legalities !== 'object' ||
                    data.legalities === null ||
                    !('pauper' in data.legalities) ||
                    typeof data.legalities.pauper !== 'string'
                )
                    throw new Error('Invalid Scryfall card response')
                result = {
                    name: data.name,
                    legal: data.legalities.pauper === 'legal',
                    known: true,
                    checkedAt: Date.now(),
                }
            }
            this.cache.set(cleanName, result)
            return result
        })
        this.queue = request.then(
            () => {},
            () => {}
        )
        this.pending.set(key, request)
        void request.then(
            () => this.pending.delete(key),
            () => this.pending.delete(key)
        )
        return request
    }
}
