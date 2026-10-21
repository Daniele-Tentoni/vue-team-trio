export type Seat = 'A' | 'B' | 'C'
export type DeckSection = 'main' | 'side'
export type ImportSource = 'text' | 'moxfield'

export interface CardIndexSource {
    cards: readonly (readonly [name: string, legal: boolean])[]
}

export interface CardInfo {
    name: string
    legal: boolean
    known?: boolean
}

export type CardIndex = ReadonlyMap<string, CardInfo>

export interface Player {
    seat: Seat
    name: string
    text: string
    source: ImportSource
    link: string
}

export interface DeckCard extends CardInfo {
    quantity: number
    key: string
    section: DeckSection
    known: boolean
    line: number
}

export interface ParseError {
    line: number
    text: string
}

export interface ParsedDeck {
    cards: DeckCard[]
    errors: ParseError[]
    mainCount: number
    sideCount: number
    sizeValid: boolean
}

export interface ValidatedDeck extends ParsedDeck {
    valid: boolean
}

export interface CardConflict {
    key: string
    seats: number[]
    name: string
}

export interface TeamValidation {
    decks: ValidatedDeck[]
    conflicts: CardConflict[]
    valid: boolean
}

export function normalizeName(name: string): string {
    return name.trim().replaceAll('\u2019', "'").replace(/\s+/g, ' ').toLowerCase()
}

export function createCardIndex(source: CardIndexSource): CardIndex {
    const index = new Map<string, CardInfo>()
    for (const [name, legal] of source.cards) {
        const key = normalizeName(name)
        index.set(key, { name, legal: legal === true || index.get(key)?.legal === true })
    }
    for (const card of [...index.values()]) {
        for (const face of card.name.split(' // ')) {
            if (!index.has(normalizeName(face))) index.set(normalizeName(face), card)
        }
    }
    return index
}

export function parseDeck(text: string, cardIndex: CardIndex | null = null): ParsedDeck {
    let section: DeckSection = 'main'
    const cards: DeckCard[] = []
    const errors: ParseError[] = []
    for (const [position, raw] of text.split(/\r?\n/).entries()) {
        const line = raw.trim()
        if (!line || line.startsWith('#') || line.startsWith('//')) continue
        if (/^(sideboard|side|sb)\s*:?$/i.test(line)) {
            section = 'side'
            continue
        }
        if (/^(mainboard|maindeck|main|deck)\s*:?$/i.test(line)) {
            section = 'main'
            continue
        }
        const match = line.match(/^(?:(SB):\s*)?(\d+)\s*x?\s+(.+?)\s*$/i)
        if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1) {
            errors.push({ line: position + 1, text: line })
            continue
        }
        const name = match[3].replace(/\s+\([A-Za-z0-9]+\)\s+[A-Za-z0-9-]+(?:\s+\*F\*)?$/, '')
        const found = cardIndex?.get(normalizeName(name))
        cards.push({
            quantity: Number(match[2]),
            name: found?.name ?? name,
            key: normalizeName(found?.name ?? name),
            section: match[1] ? 'side' : section,
            known: found?.known ?? Boolean(found),
            legal: found?.legal === true,
            line: position + 1,
        })
    }
    const mainCount = cards
        .filter((card) => card.section === 'main')
        .reduce((sum, card) => sum + card.quantity, 0)
    const sideCount = cards
        .filter((card) => card.section === 'side')
        .reduce((sum, card) => sum + card.quantity, 0)
    return { cards, errors, mainCount, sideCount, sizeValid: mainCount >= 60 && sideCount <= 15 }
}

export function validateTeam(
    players: readonly Pick<Player, 'text'>[],
    cardIndex: CardIndex | null
): TeamValidation {
    const decks: ValidatedDeck[] = players.map((player) => ({
        ...parseDeck(player.text, cardIndex),
        valid: false,
    }))
    const owners = new Map<string, { name: string; seats: Set<number> }>()
    for (const [seat, deck] of decks.entries()) {
        for (const card of deck.cards) {
            let owner = owners.get(card.key)
            if (!owner) {
                owner = { name: card.name, seats: new Set<number>() }
                owners.set(card.key, owner)
            }
            owner.seats.add(seat)
        }
    }
    const conflicts = [...owners.entries()]
        .filter(([, owner]) => owner.seats.size > 1)
        .map(([key, owner]) => ({ key, seats: [...owner.seats], name: owner.name }))
        .sort((first, second) => first.name.localeCompare(second.name))
    const conflictKeys = new Set(conflicts.map((conflict) => conflict.key))
    for (const deck of decks) {
        deck.valid =
            Boolean(cardIndex) &&
            deck.sizeValid &&
            deck.errors.length === 0 &&
            deck.cards.every((card) => card.legal && !conflictKeys.has(card.key))
    }
    return { decks, conflicts, valid: decks.length === 3 && decks.every((deck) => deck.valid) }
}

export function exportTeam(
    teamName: string,
    players: readonly Pick<Player, 'name'>[],
    decks: readonly ParsedDeck[]
): string {
    const singleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()
    const sections = players.map((player, seat) => {
        const deck = decks[seat]
        const lines = (section: DeckSection): string =>
            deck.cards
                .filter((card) => card.section === section)
                .map((card) => `${card.quantity} ${card.name}`)
                .join('\n')
        return `## ${'ABC'[seat]}: ${singleLine(player.name)}\n\n${lines('main')}\n\nSIDEBOARD:\n${lines('side')}`
    })
    return `# ${singleLine(teamName)}\n\n${sections.join('\n\n---\n\n')}\n`
}

export function parseMoxfieldLink(value: string): boolean {
    try {
        const url = new URL(value)
        return (
            url.protocol === 'https:' &&
            ['moxfield.com', 'www.moxfield.com'].includes(url.hostname) &&
            /^\/decks\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
        )
    } catch {
        return false
    }
}
