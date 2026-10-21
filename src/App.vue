<script setup lang="ts">
    import { onMounted, ref } from 'vue'
    import { storeToRefs } from 'pinia'
    import {
        ArrowDownToLine,
        ArrowRight,
        Bug,
        Check,
        CircleAlert,
        CircleCheck,
        FileText,
        GitPullRequest,
        Info,
        Layers3,
        LoaderCircle,
        LockKeyhole,
        RotateCcw,
        ShieldCheck,
        UsersRound,
        X,
    } from '@lucide/vue'
    import DeckPanel from './DeckPanel.vue'
    import { useTeamStore } from './stores/team'

    const team = useTeamStore()
    const baseUrl = import.meta.env.BASE_URL
    const repositoryUrl = 'https://github.com/Daniele-Tentoni/vue-team-trio'
    const {
        teamName,
        format,
        players,
        checking,
        verificationError,
        artCredit,
        toast,
        result,
        loadedCount,
        validCount,
        canExport,
        conflicts,
        verificationTitle,
        verificationMessage,
    } = storeToRefs(team)
    const privacyDialog = ref<HTMLDialogElement | null>(null)
    const resetDialog = ref<HTMLDialogElement | null>(null)

    onMounted(() => {
        void team.initialize()
    })

    function reset(): void {
        team.reset()
        resetDialog.value?.close()
    }
</script>

<template>
    <v-app>
        <header class="site-header">
            <div class="header-inner">
                <a class="brand" :href="baseUrl" aria-label="Trio, inizio"
                    ><span class="brand-mark"><Layers3 :size="24" :stroke-width="1.7" /></span
                    ><span>trio<span class="brand-period">.</span></span
                    ><span class="brand-descriptor">TEAM DECK CHECK</span></a
                >
                <nav aria-label="Navigazione principale">
                    <span class="nav-active">Verifica team</span
                    ><v-btn
                        class="privacy-button"
                        variant="text"
                        color="primary"
                        @click="privacyDialog?.showModal()"
                        ><ShieldCheck :size="18" /><span>Le tue liste restano tue</span
                        ><Info :size="16"
                    /></v-btn>
                </nav>
            </div>
        </header>

        <main>
            <section class="workspace-heading">
                <div>
                    <div class="eyebrow">
                        <span class="live-dot"></span> IL TUO PROSSIMO TORNEO INIZIA QUI
                    </div>
                    <h1>Tre mazzi. <span>Una squadra.</span></h1>
                    <p>Controlla le liste, risolvi i conflitti, siediti al tavolo.</p>
                </div>
                <div class="heading-seal">
                    <ShieldCheck :size="24" :stroke-width="1.5" />
                    <div>
                        <strong>Strategie private. Sempre.</strong
                        ><span>Nessun invio delle liste. Nessun account.</span>
                    </div>
                </div>
            </section>

            <div class="workflow" aria-label="Avanzamento verifica">
                <div class="step complete">
                    <span class="step-number"><Check :size="14" /></span
                    ><span>Formato del torneo</span
                    ><span class="step-caption">Team Trio Pauper</span>
                </div>
                <ArrowRight :size="16" class="step-arrow" />
                <div
                    class="step"
                    :class="{ complete: loadedCount === 3, current: loadedCount < 3 }"
                >
                    <span class="step-number"
                        ><Check v-if="loadedCount === 3" :size="14" /><template v-else
                            >02</template
                        ></span
                    ><span>Liste del team</span
                    ><span class="step-caption">{{ loadedCount }}/3 caricate</span>
                </div>
                <ArrowRight :size="16" class="step-arrow" />
                <div class="step" :class="{ complete: result.valid, current: loadedCount === 3 }">
                    <span class="step-number"
                        ><Check v-if="result.valid" :size="14" /><template v-else
                            >03</template
                        ></span
                    ><span>Verifica ed esporta</span>
                </div>
            </div>

            <section class="team-settings" aria-labelledby="team-heading">
                <div class="section-kicker">
                    <UsersRound :size="17" />
                    <h2 id="team-heading">Il tuo team</h2>
                </div>
                <div class="settings-fields">
                    <v-text-field
                        v-model="teamName"
                        class="team-name"
                        label="Nome del team"
                        maxlength="100"
                        autocomplete="off"
                        placeholder="Come si chiama la tua squadra?"
                        hide-details
                    />
                    <v-select
                        v-model="format"
                        class="tournament-format"
                        label="Formato del torneo"
                        :items="[{ title: 'Team Trio Pauper', value: 'pauper' }]"
                        hide-details
                    />
                </div>
                <div class="rules-line">
                    <v-chip class="format-tag" color="primary" size="small" variant="tonal"
                        >PAUPER</v-chip
                    ><span>Main <strong>60+ carte</strong></span
                    ><span>Side <strong>max 15 carte</strong></span
                    ><span
                        ><strong>Nessuna carta condivisa</strong> tra giocatori, terre base
                        incluse</span
                    ><v-btn
                        class="icon-button"
                        variant="text"
                        size="small"
                        icon
                        title="Regole e riservatezza"
                        aria-label="Regole e riservatezza"
                        @click="privacyDialog?.showModal()"
                        ><Info :size="18"
                    /></v-btn>
                </div>
            </section>

            <div class="section-heading">
                <div class="section-kicker">
                    <FileText :size="18" />
                    <h2>Le tre liste</h2>
                    <span class="section-note">Main e sideboard</span>
                </div>
                <div class="verification-actions">
                    <v-btn
                        variant="text"
                        size="small"
                        :disabled="checking || loadedCount === 0"
                        @click="team.verifyCards(true)"
                        ><RotateCcw :size="16" /> Aggiorna legalità</v-btn
                    ><v-btn
                        class="reset-button"
                        variant="text"
                        size="small"
                        @click="resetDialog?.showModal()"
                        ><RotateCcw :size="16" /> Ricomincia</v-btn
                    >
                </div>
            </div>

            <v-alert
                v-if="checking"
                class="notice"
                variant="tonal"
                color="primary"
                :icon="false"
                role="status"
                ><LoaderCircle :size="18" class="spin" /> Verifica delle singole carte su
                Scryfall...</v-alert
            >
            <v-alert
                v-else-if="verificationError"
                class="notice"
                type="warning"
                variant="tonal"
                role="alert"
                ><span
                    >Scryfall non disponibile per alcune carte. Legalita non verificata,
                    esportazione bloccata.</span
                ><template #append
                    ><v-btn variant="text" size="small" @click="team.verifyCards()"
                        >Riprova</v-btn
                    ></template
                ></v-alert
            >

            <section class="deck-grid" aria-label="Liste dei giocatori">
                <DeckPanel v-for="(player, seat) in players" :key="player.seat" :seat="seat" />
            </section>

            <section
                class="verification-section"
                aria-labelledby="verification-heading"
                aria-live="polite"
            >
                <div class="verification-heading">
                    <div class="section-kicker">
                        <span class="verification-icon"><ShieldCheck :size="19" /></span>
                        <h2 id="verification-heading">Il controllo di squadra</h2>
                    </div>
                    <span class="verification-total"
                        >{{ validCount }} <span>/ 3 mazzi conformi</span></span
                    >
                </div>
                <div v-if="conflicts.length" class="conflict-area">
                    <h3>
                        <CircleAlert :size="16" /> {{ conflicts.length }}
                        {{ conflicts.length === 1 ? 'carta condivisa' : 'carte condivise' }}
                    </h3>
                    <div class="conflict-chips">
                        <v-chip
                            v-for="conflict in conflicts"
                            :key="conflict.key"
                            class="conflict-chip"
                            variant="flat"
                            size="small"
                            :style="{ '--conflict': conflict.color }"
                            ><span class="conflict-dot"></span>{{ conflict.name
                            }}<strong>{{ conflict.seatsLabel }}</strong></v-chip
                        >
                    </div>
                </div>
                <div class="verification-content">
                    <div>
                        <h3>{{ verificationTitle }}</h3>
                        <p>{{ verificationMessage }}</p>
                    </div>
                    <v-btn
                        v-if="result.valid"
                        class="export-button"
                        variant="flat"
                        color="primary-container"
                        :disabled="!canExport"
                        @click="team.download()"
                        ><ArrowDownToLine :size="18" /> Esporta il team <span>.txt</span></v-btn
                    ><span v-else class="waiting-export"
                        ><LockKeyhole :size="16" /> Esportazione in attesa</span
                    >
                </div>
                <div class="verification-footer">
                    <span
                        ><span class="legend-dot illegal-dot"></span> Non legale / non
                        riconosciuta</span
                    ><span><span class="legend-dot shared-dot"></span> Condivisa tra giocatori</span
                    ><span><span class="legend-dot valid-dot"></span> Conforme</span>
                </div>
            </section>

            <footer class="page-footer">
                <span class="footer-brand">trio.</span
                ><span>Fatto per il tuo team, non per i tuoi dati.</span
                ><v-btn
                    class="legality-info"
                    variant="text"
                    size="small"
                    @click="privacyDialog?.showModal()"
                    ><span class="live-dot"></span>Scryfall · cache 24 h<Info :size="15" /></v-btn
                ><span class="version">VERSIONE 1.0</span>
            </footer>
            <div class="art-ribbon" role="img" aria-label="Illustrazione di Magic: Crop Rotation">
                <span v-if="artCredit"
                    >{{ artCredit.card }} · Illustrazione di {{ artCredit.artist }} · Magic: The
                    Gathering © Wizards of the Coast</span
                >
            </div>
            <footer class="contribution-footer">
                <h2>Contribuisci a Trio</h2>
                <nav aria-label="Contribuisci al progetto">
                    <v-btn
                        variant="text"
                        color="primary"
                        :href="repositoryUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerpolicy="no-referrer"
                        >Repository GitHub</v-btn
                    >
                    <v-btn
                        variant="text"
                        :href="`${repositoryUrl}/issues`"
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerpolicy="no-referrer"
                        ><Bug :size="18" />Segnala un problema</v-btn
                    >
                    <v-btn
                        variant="text"
                        :href="`${repositoryUrl}/pulls`"
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerpolicy="no-referrer"
                        ><GitPullRequest :size="18" />Proponi una modifica</v-btn
                    >
                </nav>
            </footer>
        </main>

        <dialog ref="privacyDialog" class="modal" aria-labelledby="privacy-title">
            <v-btn
                class="icon-button modal-close"
                variant="text"
                size="small"
                icon
                aria-label="Chiudi informazioni"
                @click="privacyDialog?.close()"
                ><X :size="20"
            /></v-btn>
            <ShieldCheck :size="30" class="modal-symbol" />
            <h2 id="privacy-title">Le tue liste restano tue.</h2>
            <p>
                Liste, quantita, nomi dei giocatori, team e link Moxfield restano nella memoria del
                browser. Nessun account, analytics o invio di mazzi completi. Ricaricando la pagina,
                i dati del team vengono persi.
            </p>
            <h3>Solo Scryfall, una carta alla volta</h3>
            <p>
                L'unico servizio esterno contattato e api.scryfall.com: ogni richiesta GET contiene
                soltanto il nome di una carta. Non vengono inviati mazzi, quantita, sideboard, nomi
                o seating. Le richieste non includono credenziali ne referrer.
            </p>
            <h3>Cache locale della legalita</h3>
            <p>
                Solo nome, legalita e data di controllo della singola carta vengono conservati
                localmente, fino a 24 ore (un'ora per nomi non trovati), senza associazioni al team.
                Nessun catalogo globale viene scaricato.
            </p>
            <p>
                Ogni giorno alle 19:05 CET (UTC+1 fisso, anche in estate) scadono le risposte
                precedenti alla soglia: vengono ricontrollate anche nei giorni senza annunci
                programmati. La scadenza viene verificata anche prima dell'export. Aggiorna legalità
                forza comunque un nuovo controllo; Scryfall potrebbe non riflettere subito un
                annuncio appena pubblicato.
            </p>
            <p>Se Scryfall non risponde e manca un dato recente, l'esportazione resta bloccata.</p>
            <h3>Link Moxfield</h3>
            <p>
                Moxfield non viene contattato: il link e riconosciuto localmente. Incolla l'export
                testuale nel pannello.
            </p>
            <h3>Regolamento V1</h3>
            <p>
                Almeno 60 carte nel main, al massimo 15 in sideboard, tutte legali in Pauper.
                Nessuna carta puo comparire in piu giocatori, incluse terre base e sideboard. Usa i
                nomi inglesi delle carte. La verifica applica queste tre regole, non limiti
                aggiuntivi di copie per mazzo.
            </p>
            <p class="modal-footnote">
                Progetto indipendente, non affiliato a Wizards of the Coast, Scryfall o Moxfield.
            </p>
            <v-btn class="primary-button" color="primary" @click="privacyDialog?.close()"
                >Torna al team <ArrowRight :size="16"
            /></v-btn>
        </dialog>
        <dialog ref="resetDialog" class="modal reset-modal" aria-labelledby="reset-title">
            <h2 id="reset-title">Ricominciare la verifica?</h2>
            <p>
                I nomi, le liste e i link del team verranno rimossi. Questa operazione non puo
                essere annullata.
            </p>
            <div class="modal-actions">
                <v-btn variant="text" @click="resetDialog?.close()">Annulla</v-btn
                ><v-btn color="primary" @click="reset"><RotateCcw :size="16" /> Ricomincia</v-btn>
            </div>
        </dialog>
        <div v-if="toast" class="toast" role="status"><CircleCheck :size="17" />{{ toast }}</div>
    </v-app>
</template>
