<script setup lang="ts">
    import {
        Check,
        CheckCheck,
        CircleAlert,
        CircleCheck,
        FileText,
        Link,
        LockKeyhole,
        Trash2,
    } from '@lucide/vue'
    import { computed } from 'vue'
    import { useTeamStore } from './stores/team'

    const props = defineProps<{ seat: number }>()
    const team = useTeamStore()
    const player = computed(() => team.players[props.seat])
    const deck = computed(() => team.deckViews[props.seat])
</script>

<template>
    <v-card
        tag="article"
        variant="outlined"
        class="deck-panel"
        :class="{ 'deck-valid': deck.valid }"
    >
        <header class="deck-header">
            <div class="player-label">
                <span class="seat-badge">{{ player.seat }}</span>
                <div>
                    <h3>Giocatore {{ player.seat }}</h3>
                    <span>POSTO {{ player.seat }}</span>
                </div>
            </div>
            <span v-if="deck.valid" class="deck-status status-valid"
                ><CircleCheck :size="13" /> {{ deck.status }}</span
            >
            <span v-else class="deck-status"><span class="small-dot"></span>{{ deck.status }}</span>
        </header>
        <div class="deck-body">
            <v-text-field
                :id="`name-${seat}`"
                :model-value="player.name"
                class="player-name"
                label="Nome e cognome"
                maxlength="100"
                autocomplete="off"
                :placeholder="`Nome del giocatore ${player.seat}`"
                hide-details
                @update:model-value="team.updatePlayer(seat, { name: $event ?? '' })"
            />
            <v-btn-toggle
                :model-value="player.source"
                class="source-tabs"
                mandatory
                divided
                variant="outlined"
                color="primary"
                :aria-label="`Metodo di importazione giocatore ${player.seat}`"
                @update:model-value="team.updatePlayer(seat, { source: $event })"
            >
                <v-btn value="text" :aria-pressed="player.source === 'text'"
                    ><FileText :size="16" />Lista testuale</v-btn
                >
                <v-btn value="moxfield" :aria-pressed="player.source === 'moxfield'"
                    ><Link :size="16" />Moxfield</v-btn
                >
            </v-btn-toggle>
            <div v-if="player.source === 'moxfield'" class="moxfield-section">
                <v-text-field
                    :id="`link-${seat}`"
                    :model-value="player.link"
                    label="Link Moxfield"
                    type="url"
                    autocomplete="off"
                    placeholder="https://moxfield.com/decks/..."
                    :error="deck.linkInvalid"
                    hide-details
                    @update:model-value="team.updatePlayer(seat, { link: $event ?? '' })"
                />
                <p v-if="deck.linkInvalid" class="inline-error">
                    Inserisci un link HTTPS valido a un mazzo Moxfield.
                </p>
                <p class="moxfield-note">
                    <LockKeyhole :size="14" /><span
                        >{{ deck.linkMessage }} Per non contattare Moxfield, incolla qui sotto la
                        sua esportazione testuale. Il solo link non importa la lista.</span
                    >
                </p>
            </div>
            <div class="editor-label">
                <span>MAIN + SIDEBOARD</span>
                <v-btn
                    v-if="deck.hasText"
                    class="icon-button"
                    variant="text"
                    size="small"
                    icon
                    :title="`Svuota la lista ${player.seat}`"
                    :aria-label="`Svuota la lista ${player.seat}`"
                    @click="team.clearDeck(seat)"
                    ><Trash2 :size="16"
                /></v-btn>
                <span v-else>TESTO</span>
            </div>
            <v-textarea
                :id="`list-${seat}`"
                :model-value="player.text"
                class="deck-editor"
                :label="
                    player.source === 'moxfield' ? 'Export testuale Moxfield' : 'Lista del mazzo'
                "
                :rows="9"
                :spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                :aria-label="`Lista del giocatore ${player.seat}`"
                :placeholder="`4 Lightning Bolt\n4 Chain Lightning\n18 Mountain\n...\n\nSIDEBOARD:\n3 Pyroblast\n...`"
                :error="deck.editorInvalid"
                hide-details
                @update:model-value="team.updatePlayer(seat, { text: $event ?? '' })"
            />
            <div class="deck-counters">
                <span :class="{ 'counter-error': deck.hasText && deck.mainIncomplete }"
                    >Main <strong>{{ deck.mainCount }}</strong
                    ><span>/ 60+</span></span
                >
                <span :class="{ 'counter-error': deck.sideOverLimit }"
                    >Side <strong>{{ deck.sideCount }}</strong
                    ><span>/ 15</span></span
                >
                <span v-if="deck.valid" class="counter-check"><CheckCheck :size="16" /></span>
            </div>
            <v-alert
                v-if="deck.hasText && !deck.sizeValid"
                class="size-warning"
                type="warning"
                variant="tonal"
                density="compact"
                :icon="false"
                role="status"
            >
                <CircleAlert :size="16" /><span>{{ deck.sizeWarning }}</span>
            </v-alert>
            <div v-if="deck.errors.length" class="parse-errors" role="status">
                <p v-for="error in deck.errors" :key="error.line">
                    Riga {{ error.line }} non riconosciuta: {{ error.text }}
                </p>
            </div>
            <div v-if="deck.cards.length" class="card-review">
                <div class="review-title">
                    <span>CONTROLLO CARTE</span><span>{{ deck.cards.length }} voci</span>
                </div>
                <div
                    class="card-scroll"
                    :aria-label="`Esito carte giocatore ${player.seat}`"
                    tabindex="0"
                >
                    <template v-for="section in deck.sections" :key="section.key">
                        <div class="card-section-title">{{ section.title }}</div>
                        <div
                            v-for="card in section.cards"
                            :key="card.line"
                            class="card-row"
                            :class="{
                                'card-illegal': card.illegal,
                                'card-conflict': Boolean(card.conflict),
                            }"
                            :style="card.conflict ? { '--conflict': card.conflict.color } : {}"
                            tabindex="0"
                            :aria-label="`${card.quantity} ${card.name}. ${card.tooltip}`"
                        >
                            <span class="card-quantity">{{ card.quantity }}</span
                            ><span class="card-name">{{ card.name }}</span>
                            <CircleAlert v-if="card.illegal" :size="14" />
                            <span v-else-if="card.conflict" class="shared-seats">{{
                                card.sharedSeats
                            }}</span>
                            <Check v-else-if="card.verified" :size="12" class="legal-tick" />
                            <span class="card-tooltip" role="tooltip">{{ card.tooltip }}</span>
                        </div>
                    </template>
                </div>
            </div>
            <div v-else class="empty-caption">
                <LockKeyhole :size="12" /> Questa lista resta nel tuo browser
            </div>
        </div>
    </v-card>
</template>
