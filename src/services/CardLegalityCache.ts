import { normalizeName } from '../domain'

export interface CardLegality {
    name: string
    legal: boolean
    known: boolean
    checkedAt: number
}

export const LEGALITY_CACHE_KEY = 'trio:card-legality:v1'
export const LEGALITY_TTL = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 1000

export function isCardLegalityFresh(entry: CardLegality, now = Date.now()): boolean {
    const date = new Date(now)
    let cutoff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 18, 5)
    if (now < cutoff) cutoff -= LEGALITY_TTL
    const age = now - entry.checkedAt
    return (
        age >= 0 && age < (entry.known ? LEGALITY_TTL : 60 * 60 * 1000) && entry.checkedAt >= cutoff
    )
}

function browserStorage(): Storage | null {
    try {
        return globalThis.localStorage ?? null
    } catch {
        return null
    }
}

function isEntry(value: unknown): value is CardLegality {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        typeof value.name === 'string' &&
        value.name.length > 0 &&
        value.name.length <= 200 &&
        'legal' in value &&
        typeof value.legal === 'boolean' &&
        'known' in value &&
        typeof value.known === 'boolean' &&
        'checkedAt' in value &&
        typeof value.checkedAt === 'number' &&
        Number.isFinite(value.checkedAt)
    )
}

export class CardLegalityCache {
    private entries = new Map<string, CardLegality>()

    constructor(
        private readonly storage: Storage | null = browserStorage(),
        private readonly now: () => number = Date.now
    ) {
        try {
            const raw: unknown = JSON.parse(this.storage?.getItem(LEGALITY_CACHE_KEY) ?? '[]')
            if (Array.isArray(raw)) {
                for (const pair of raw.slice(-MAX_ENTRIES)) {
                    if (
                        Array.isArray(pair) &&
                        typeof pair[0] === 'string' &&
                        pair[0].length <= 200 &&
                        isEntry(pair[1]) &&
                        this.fresh(pair[1])
                    )
                        this.entries.set(pair[0], pair[1])
                }
            }
        } catch {
            this.entries.clear()
        }
    }

    private fresh(entry: CardLegality): boolean {
        return isCardLegalityFresh(entry, this.now())
    }

    get(name: string): CardLegality | undefined {
        const key = normalizeName(name)
        const entry = this.entries.get(key)
        if (entry && this.fresh(entry)) return { ...entry }
        this.entries.delete(key)
        return undefined
    }

    delete(name: string): void {
        const normalized = normalizeName(name)
        const canonical = normalizeName(this.entries.get(normalized)?.name ?? name)
        for (const [key, entry] of this.entries)
            if (key === normalized || normalizeName(entry.name) === canonical)
                this.entries.delete(key)
        this.persist()
    }

    set(name: string, entry: CardLegality): void {
        this.entries.set(normalizeName(name), { ...entry })
        this.entries.set(normalizeName(entry.name), { ...entry })
        for (const [key, value] of this.entries) if (!this.fresh(value)) this.entries.delete(key)
        while (this.entries.size > MAX_ENTRIES) {
            const key = this.entries.keys().next().value
            if (key === undefined) break
            this.entries.delete(key)
        }
        this.persist()
    }

    private persist(): void {
        try {
            this.storage?.setItem(LEGALITY_CACHE_KEY, JSON.stringify([...this.entries]))
        } catch {}
    }
}
