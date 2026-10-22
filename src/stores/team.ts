import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { exportTeam, normalizeName, parseDeck, parseMoxfieldLink, validateTeam } from '../domain'
import type { CardIndex, DeckCard, Player, Seat } from '../domain'
import { PublicDataService } from '../services/PublicDataService'
import type { ArtCredit } from '../services/PublicDataService'
import { FileDownloadService } from '../services/FileDownloadService'
import { ScryfallService } from '../services/ScryfallService'
import { isCardLegalityFresh } from '../services/CardLegalityCache'
import type { CardLegality } from '../services/CardLegalityCache'

export interface TeamExport {
    filename: string
    text: string
}

const seats: Seat[] = ['A', 'B', 'C']
const colors = ['#a264ce', '#bd7208', '#257eb2', '#ce587e', '#547d2e', '#9b633a']

export const useTeamStore = defineStore('team', () => {
    const service = new PublicDataService()
    const scryfall = new ScryfallService()
    const fileDownload = new FileDownloadService()
    const teamName = ref('')
    const format = ref<'pauper'>('pauper')
    const players = ref<Player[]>(
        seats.map((seat) => ({ seat, name: '', text: '', source: 'text', link: '' }))
    )
    const entries = shallowRef(new Map<string, CardLegality>())
    const failed = shallowRef(new Set<string>())
    const pending = shallowRef(new Set<string>())
    const checking = ref(false)
    const clock = ref(Date.now())
    const artCredit = ref<ArtCredit | null>(null)
    const toast = ref('')
    let toastTimeout: ReturnType<typeof setTimeout> | undefined
    let pendingInitialization: Promise<void> | null = null
    let verificationTimer: ReturnType<typeof setTimeout> | undefined
    let generation = 0
    const cardNames = computed(() => [
        ...new Map(
            players.value
                .flatMap((player) => parseDeck(player.text).cards)
                .map((card) => [card.key, card.name])
        ).values(),
    ])
    const cardIndex = computed<CardIndex>(
        () =>
            new Map(
                [...entries.value].filter(
                    ([key, entry]) =>
                        !failed.value.has(key) && isCardLegalityFresh(entry, clock.value)
                )
            )
    )
    const verificationError = computed(() =>
        cardNames.value.some((name) => failed.value.has(normalizeName(name)))
    )

    const result = computed(() => {
        const validation = validateTeam(players.value, cardIndex.value)
        if (checking.value || verificationError.value) {
            validation.valid = false
            for (const deck of validation.decks) deck.valid = false
        }
        return validation
    })
    const loadedCount = computed(() => players.value.filter((player) => player.text.trim()).length)
    const validCount = computed(() => result.value.decks.filter((deck) => deck.valid).length)
    const namesComplete = computed(
        () =>
            Boolean(teamName.value.trim()) &&
            players.value.every((player) => Boolean(player.name.trim()))
    )
    const canExport = computed(() => result.value.valid && namesComplete.value)
    const conflictMap = computed(
        () =>
            new Map(
                result.value.conflicts.map((conflict, position) => [
                    conflict.key,
                    { ...conflict, color: colors[position % colors.length] },
                ])
            )
    )
    const conflicts = computed(() =>
        [...conflictMap.value.values()].map((conflict) => ({
            ...conflict,
            seatsLabel: conflict.seats.map((seat) => seats[seat]).join(' / '),
        }))
    )
    const deckViews = computed(() =>
        result.value.decks.map((deck, seat) => {
            const player = players.value[seat]
            const hasText = Boolean(player.text.trim())
            const mainIncomplete = deck.mainCount < 60
            const linkValid = parseMoxfieldLink(player.link)
            return {
                ...deck,
                hasText,
                mainIncomplete,
                sideOverLimit: deck.sideCount > 15,
                editorInvalid: hasText && (!deck.sizeValid || deck.errors.length > 0),
                linkInvalid: Boolean(player.link) && !linkValid,
                linkMessage: linkValid
                    ? 'Link riconosciuto e mantenuto solo in memoria.'
                    : 'Il link non viene aperto ne inviato.',
                status: deck.valid
                    ? 'Conforme'
                    : hasText
                      ? checking.value
                          ? 'Verifica in corso'
                          : 'Da verificare'
                      : 'In attesa',
                sizeWarning:
                    `${mainIncomplete ? `Main incompleto: mancano ${60 - deck.mainCount} carte.` : ''} ${deck.sideCount > 15 ? `Sideboard oltre il limite: ${deck.sideCount}/15.` : ''} Mazzo non legale.`.trim(),
                sections: (['main', 'side'] as const)
                    .map((section) => ({
                        key: section,
                        title: section === 'main' ? 'Main deck' : 'Sideboard',
                        cards: deck.cards
                            .filter((card) => card.section === section)
                            .map((card) => {
                                const conflict = conflictMap.value.get(card.key)
                                const verified =
                                    cardIndex.value.has(card.key) && !pending.value.has(card.key)
                                return {
                                    ...card,
                                    illegal: verified && !card.legal,
                                    verified,
                                    conflict,
                                    sharedSeats: conflict?.seats
                                        .map((index) => seats[index])
                                        .join(' / '),
                                    tooltip: cardTitle(card),
                                }
                            }),
                    }))
                    .filter((section) => section.cards.length > 0),
            }
        })
    )
    const verificationTitle = computed(() =>
        result.value.valid
            ? 'Il team è pronto per il torneo.'
            : loadedCount.value === 0
              ? 'Il prossimo passo è del tuo team.'
              : 'Una squadra, nessuna sovrapposizione.'
    )
    const verificationMessage = computed(() => {
        if (checking.value)
            return 'Verifica delle singole carte su Scryfall in corso. Esportazione temporaneamente bloccata.'
        if (verificationError.value)
            return 'Alcune carte non sono verificabili. Riprova la verifica prima di esportare.'
        if (result.value.valid)
            return namesComplete.value
                ? 'Tre liste conformi. Tutto pronto per esportare.'
                : 'Liste conformi. Completa il nome del team e dei tre giocatori per esportare.'
        if (loadedCount.value < 3)
            return `In attesa delle liste ${players.value
                .filter((player) => !player.text.trim())
                .map((player) => player.seat)
                .join(
                    ', '
                )}. L'esportazione sarà disponibile quando tutti i mazzi saranno conformi.`
        return 'Risolvi gli avvisi nelle liste. Ogni carta deve appartenere a un solo giocatore del team.'
    })

    function cardTitle(card: DeckCard): string {
        const messages: string[] = []
        if (failed.value.has(card.key))
            messages.push('Legalità non verificabile: Scryfall non disponibile. Riprova.')
        else if (pending.value.has(card.key) || !cardIndex.value.has(card.key))
            messages.push('Verifica della legalità in corso su Scryfall.')
        else if (!card.known)
            messages.push('Carta non trovata. Verifica il nome inglese e la sintassi.')
        else if (!card.legal) messages.push('Questa carta non è legale in Pauper secondo Scryfall.')
        const conflict = conflictMap.value.get(card.key)
        if (conflict)
            messages.push(
                `Carta condivisa nei posti ${conflict.seats.map((seat) => seats[seat]).join(', ')}. Deve appartenere a un solo giocatore, sideboard inclusa.`
            )
        return messages.join(' ') || 'Carta legale in Pauper. Nessun conflitto nel team.'
    }

    async function verifyCards(force = false): Promise<void> {
        clearTimeout(verificationTimer)
        const currentGeneration = ++generation
        const names = cardNames.value
        checking.value = names.length > 0
        failed.value = new Set()
        pending.value = new Set(names.map(normalizeName))
        clock.value = Date.now()
        await Promise.all(
            names.map(async (name) => {
                const key = normalizeName(name)
                try {
                    const entry = await scryfall.lookup(name, force)
                    if (currentGeneration !== generation) return
                    entries.value = new Map(entries.value)
                        .set(key, entry)
                        .set(normalizeName(entry.name), entry)
                } catch {
                    if (currentGeneration !== generation) return
                    failed.value = new Set(failed.value).add(key)
                    const remaining = new Map(entries.value)
                    remaining.delete(key)
                    entries.value = remaining
                } finally {
                    if (currentGeneration === generation) {
                        const remaining = new Set(pending.value)
                        remaining.delete(key)
                        pending.value = remaining
                    }
                }
            })
        )
        if (currentGeneration === generation) {
            clock.value = Date.now()
            checking.value = false
        }
    }

    function scheduleVerification(): void {
        ++generation
        clearTimeout(verificationTimer)
        checking.value = cardNames.value.length > 0
        if (!checking.value) {
            pending.value = new Set()
            failed.value = new Set()
            return
        }
        verificationTimer = setTimeout(() => {
            void verifyCards()
        }, 400)
    }

    watch(() => players.value.map((player) => player.text), scheduleVerification, { flush: 'sync' })
    const expiryTimer = setInterval(() => {
        clock.value = Date.now()
        if (
            !checking.value &&
            cardNames.value.some(
                (name) =>
                    entries.value.has(normalizeName(name)) &&
                    !cardIndex.value.has(normalizeName(name))
            )
        )
            scheduleVerification()
    }, 60_000)

    function initialize(): Promise<void> {
        if (pendingInitialization) return pendingInitialization
        pendingInitialization = service
            .loadArtCredit()
            .then((data) => {
                artCredit.value = data
            })
            .catch(() => {
                artCredit.value = null
            })
        return pendingInitialization
    }

    function updatePlayer(seat: number, patch: Partial<Omit<Player, 'seat'>>): void {
        const player = players.value[seat]
        if (player) Object.assign(player, patch)
    }

    function clearDeck(seat: number): void {
        updatePlayer(seat, { text: '' })
    }

    function notify(message: string): void {
        toast.value = message
        clearTimeout(toastTimeout)
        toastTimeout = setTimeout(() => {
            toast.value = ''
        }, 4000)
    }

    function prepareExport(): TeamExport | null {
        clock.value = Date.now()
        if (
            cardNames.value.some(
                (name) =>
                    !cardIndex.value.has(normalizeName(name)) &&
                    !failed.value.has(normalizeName(name))
            )
        ) {
            if (!checking.value) void verifyCards()
            return null
        }
        if (!canExport.value) return null
        return {
            filename: `${
                teamName.value
                    .trim()
                    .replace(/[^a-zA-Z0-9_-]+/g, '-')
                    .replace(/^-|-$/g, '') || 'team'
            }-pauper.txt`,
            text: exportTeam(teamName.value, players.value, result.value.decks),
        }
    }

    function reset(): void {
        teamName.value = ''
        format.value = 'pauper'
        for (const player of players.value)
            Object.assign(player, { name: '', text: '', link: '', source: 'text' })
        notify('Verifica azzerata. Nessun dato conservato.')
    }

    function download(): void {
        const file = prepareExport()
        if (!file) return
        fileDownload.save(file.filename, file.text)
        notify('Le tre liste sono state esportate.')
    }

    onScopeDispose(() => {
        ++generation
        clearTimeout(toastTimeout)
        clearTimeout(verificationTimer)
        clearInterval(expiryTimer)
    })

    return {
        teamName,
        format,
        players,
        cardIndex,
        checking,
        verificationError,
        artCredit,
        toast,
        result,
        loadedCount,
        validCount,
        namesComplete,
        canExport,
        conflicts,
        deckViews,
        verificationTitle,
        verificationMessage,
        initialize,
        verifyCards,
        updatePlayer,
        clearDeck,
        prepareExport,
        download,
        reset,
        notify,
    }
})
