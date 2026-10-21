import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
    createCardIndex,
    parseDeck,
    validateTeam,
    exportTeam,
    parseMoxfieldLink,
} from '../src/domain.ts'

const index = createCardIndex({
    cards: [
        ['Forest', true],
        ['Island', true],
        ['Mountain', true],
        ['Sol Ring', false],
        ['Fire // Ice', true],
    ],
})
const players = ['Forest', 'Island', 'Mountain'].map((name, seat) => ({
    name: `Player ${seat}`,
    text: `60 ${name}`,
}))

test('merges duplicate Oracle names without letting nonplayable variants override legality', () => {
    for (const cards of [
        [
            ['Llanowar Elves', true],
            ['Llanowar Elves', false],
        ],
        [
            ['Llanowar Elves', false],
            ['Llanowar Elves', true],
        ],
    ] as const) {
        assert.equal(createCardIndex({ cards }).get('llanowar elves')?.legal, true)
    }
})

test('accepts exactly three legal decks with disjoint cards', () => {
    assert.equal(validateTeam(players, index).valid, true)
    assert.equal(validateTeam(players.slice(0, 2), index).valid, false)
    assert.equal(validateTeam(players, null).valid, false)
})

test('enforces main and sideboard sizes, allowing more than 60 main cards', () => {
    assert.equal(parseDeck('59 Forest', index).sizeValid, false)
    assert.equal(parseDeck('61 Forest\nSIDEBOARD:\n15 Island', index).sizeValid, true)
    assert.equal(parseDeck('60 Forest\nSIDEBOARD:\n16 Island', index).sizeValid, false)
})

test('flags shared basic lands and main-to-side overlaps, not repeats within one deck', () => {
    const result = validateTeam(
        [players[0], { ...players[1], text: '60 Island\nSIDEBOARD:\n1 Forest' }, players[2]],
        index
    )
    assert.deepEqual(result.conflicts[0].seats, [0, 1])
    assert.equal(result.valid, false)
    assert.equal(
        validateTeam([{ ...players[0], text: '30 Forest\n30 Forest' }, ...players.slice(1)], index)
            .valid,
        true
    )
})

test('rejects illegal, unknown and malformed entries without discarding errors', () => {
    for (const text of [
        '60 Sol Ring',
        '60 Unknown Card',
        '60 Forest\nnot a card',
        '60 Forest\n0 Island',
        '60 Forest\n9007199254740992 Island',
    ]) {
        assert.equal(
            validateTeam([{ ...players[0], text }, ...players.slice(1)], index).valid,
            false
        )
    }
})

test('parses CRLF, SB prefixes, Moxfield set suffixes and canonical split names', () => {
    const deck = parseDeck('Deck\r\n60 Forest (M21) 274\r\nSB: 2 Fire\r\n', index)
    assert.equal(deck.mainCount, 60)
    assert.equal(deck.sideCount, 2)
    assert.equal(deck.cards[1].name, 'Fire // Ice')
    assert.equal(deck.errors.length, 0)
})

test('exports team, names, seating and all sideboards in requested order', () => {
    const result = validateTeam(players, index)
    const output = exportTeam('Test team', players, result.decks)
    assert.ok(output.startsWith('# Test team\n\n## A: Player 0\n\n60 Forest'))
    assert.ok(output.includes('---\n\n## B: Player 1'))
    assert.ok(output.includes('## C: Player 2'))
    assert.equal(output.match(/SIDEBOARD:/g)?.length, 3)
})

test('recognizes Moxfield links without fetching or accepting unrelated hosts', () => {
    assert.equal(parseMoxfieldLink('https://www.moxfield.com/decks/abc_123-x'), true)
    assert.equal(parseMoxfieldLink('https://moxfield.com.evil.test/decks/abc'), false)
    assert.equal(parseMoxfieldLink('http://moxfield.com/decks/abc'), false)
})
