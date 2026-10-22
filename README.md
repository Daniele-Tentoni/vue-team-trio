# Trio · Team Deck Check

Applicazione Vue 3 e TypeScript per controllare tre liste **Team Trio Pauper**, con interfaccia italiana. Le liste sono elaborate nel browser; la legalita viene cercata su **Scryfall, una carta alla volta**, con cache locale a scadenza. Non si scarica alcun catalogo globale. Componenti, stato, motore e test usano TypeScript con controllo `strict`, inclusi i template Vue. TypeScript e fissato alla serie 5.9, compatibile con `vue-tsc`.

## Interfaccia MD3

L'interfaccia usa **Vuetify 3 con il blueprint ufficiale `md3`** (Material Design 3), configurato in `src/vuetify.ts`. Campi, selettore del formato, editor delle liste, controlli segmentati, schede dei giocatori, pulsanti, chip e avvisi sono componenti Vuetify. Il tema chiaro conserva i colori del team; gli adattamenti responsive sono in `src/md3.css`. I dialog nativi mantengono focus ed Escape del browser, con superfici e pulsanti coerenti con MD3.

Vuetify, stili e icone Lucide sono inclusi nel bundle: non vengono caricati font, icon font, CDN o altre risorse di terze parti durante l'uso. Il blueprint non modifica le regole di validazione, l'esportazione o la riservatezza.

## Stato e servizi

- `src/stores/team.ts`: store Pinia condiviso dalle pagine e dai pannelli. Gestisce team, posti, liste, verifica asincrona, conflitti, tooltip, retry, aggiornamento forzato, export, reset e notifiche. Attende 400 ms dopo una modifica della lista e verifica solo i nomi unici. Risposte di verifiche superate da nuove modifiche non ripristinano esiti obsoleti.
- `src/domain.ts`: funzioni pure del dominio richiamate dallo store (parsing, legalita, conflitti e generazione del testo), riutilizzate dai test. Non contiene rete, stato globale o accessi al browser.
- `src/services/ScryfallService.ts`: unica classe di accesso esterno. Effettua esclusivamente GET a `https://api.scryfall.com/cards/named?exact=...`, con un solo nome per richiesta, niente body, credenziali o referrer e nessun redirect. Deduplica le richieste concorrenti e le serializza con almeno **250 ms** tra gli inizi (massimo circa 4 richieste al secondo per istanza). Timeout di 15 secondi; su 429 o errori di rete/CORS opachi applica fino a due retry con backoff, rispettando `Retry-After` se leggibile. Errori e rate limit non sono risultati di illegalita e non vengono memorizzati nella cache.
- `src/services/CardLegalityCache.ts`: cache in memoria e localStorage delle sole informazioni pubbliche per carta, con validazione dei record, scadenza e limite di 1.000 chiavi. Se localStorage non e disponibile, resta attiva la cache in memoria.
- `src/services/PublicDataService.ts`: legge soltanto i crediti dell'illustrazione da un URL fisso della stessa origine. Non riceve informazioni sui team.
- `src/services/FileDownloadService.ts`: download locale tramite Blob, senza rete. Lo store controlla che le liste e i nomi siano completi prima di invocarlo.
- I componenti Vue visualizzano i risultati dello store e invocano le sue azioni. I riferimenti DOM e l'apertura/chiusura dei dialog nativi restano nella vista.

Pinia non usa plugin di persistenza: i dati del team restano soltanto in memoria e vengono persi al ricaricamento. Solo la cache delle singole carte e persistente. Moxfield e qualsiasi altro servizio esterno diverso dall'API Scryfall non vengono contattati.

## Avvio

Per sviluppo e test usare Node.js 24. Vitest 5 supporta anche Node.js 22.12+ della serie 22 e Node.js 26+; Node.js 20 non e supportato dal runner dei test.

```sh
npm install
npm run dev
```

Aprire l'indirizzo stampato da Vite, con percorso `/vue-team-trio/`. In `public/` rimangono l'illustrazione locale, i suoi crediti e il redirect `404.html`, senza file globali di carte.

```sh
npm test
npm run test:coverage
npm run typecheck
npm run test:e2e
npm run build
npm run preview
```

`npm run build` esegue prima il controllo dei tipi con `vue-tsc`. Il server dev si avvia soltanto manualmente con `npm run dev`, mai al termine dei test.

I test end-to-end Playwright coprono componenti MD3, download, conflitti, tooltip, singole richieste Scryfall, privacy, riuso della cache dopo il ricaricamento, errori/retry, refresh forzato, reset e viewport 320/390/768/1440 px. Le risposte Scryfall sono simulate, senza inviare liste reali. In locale viene usato un solo browser: Edge installato su Windows, Chromium sugli altri sistemi (`npx playwright install chromium`). Quando `CI` e impostata, gli stessi scenari vengono eseguiti nei due progetti **Chromium (Blink)** e **Firefox (Gecko)**, con risultati e tracce distinti per progetto.

`npm run test:e2e` genera prima la build, avvia soltanto un server **preview temporaneo** su `http://127.0.0.1:4173/vue-team-trio/` e lo chiude al termine. Non avvia ne riavvia il server dev. I test coprono anche il sottopercorso Pages e il redirect di una risposta 404. I test unitari del motore, dello store e dei servizi usano **Vitest**, con richieste simulate e senza contattare servizi esterni; `npm run typecheck` verifica anche test e configurazioni senza generare JavaScript nei sorgenti.

## Test unitari e coverage

```sh
npm test
npm run test:watch
npm run test:coverage
```

- `npm test` esegue una volta i test unitari; `test:watch` li riesegue durante lo sviluppo.
- `test:coverage` usa il provider **V8** con versioni allineate di Vitest e `@vitest/coverage-v8`.
- `vitest.config.ts` include tutti i file TypeScript di `src/stores/` e `src/services/`, anche quelli senza test, e richiede almeno **90% per ogni file** su istruzioni, rami, funzioni e righe. Una singola metrica insufficiente fa fallire il comando.
- I report vengono generati in `coverage/`: riepilogo nel terminale, HTML in `coverage/index.html`, LCOV e JSON summary. La cartella e esclusa da Git e Prettier.
- La configurazione unitaria usa Node e include soltanto `tests/**/*.test.ts`: Playwright e i test e2e rimangono separati e non vengono avviati da Vitest. Mock e globali sono ripristinati tra i test; i percorsi temporizzati usano timer simulati quando necessario.

I workflow di pull request e deploy eseguono `test:coverage`, rendendo vincolante la soglia del 90%. Nelle PR il report e disponibile come artefatto GitHub Actions per sette giorni, anche se la soglia non viene raggiunta. Non e pubblicato nel sito Pages.

## Formattazione del codice

Prettier e installato come dipendenza di sviluppo con versione esatta per risultati riproducibili su Windows, macOS e Linux. La configurazione usa **4 spazi**, senza tab, terminazioni **LF** e indentazione anche dentro gli script e gli stili dei componenti Vue. EditorConfig imposta UTF-8 e le stesse regole di indentazione; `.gitattributes` mantiene LF nei file di testo anche con configurazioni Git differenti.

```sh
npm run format
npm run format:check
```

`format` applica la formattazione; `format:check` verifica senza modificare i file. Sono esclusi dipendenze, build, risultati dei test, coverage, lockfile npm e file `.env`. In VS Code si puo usare l'estensione Prettier con la versione locale del progetto. Nessuna formattazione automatica e stata aggiunta alla build o ai test: i sorgenti preesistenti non sono stati riformattati in massa e possono richiedere un primo `npm run format` prima che il controllo globale passi.

## Regole applicate

- Main deck di almeno 60 carte; sideboard di massimo 15 carte.
- Tutte le carte devono avere legalita Pauper `legal` nella risposta Scryfall o in una voce di cache non scaduta. Carte sconosciute o non legali sono rosse e hanno un tooltip accessibile anche da tastiera. Una risposta mancante o un errore di rete sono invece una verifica incompleta, non una carta illegale.
- Nessuna carta puo appartenere a piu di un giocatore, considerando insieme main e sideboard. Questa V1 segue letteralmente la regola richiesta: **anche le terre base condivise sono un conflitto**. Ogni carta in conflitto ha lo stesso colore nelle liste coinvolte, con indicazione dei posti A/B/C.
- Le righe non interpretabili bloccano l'esportazione, anziche essere ignorate. Non si applicano limiti aggiuntivi di copie per mazzo non previsti dalle tre regole richieste.

Le liste usano nomi inglesi e righe `4 Lightning Bolt`. Sono accettati `SIDEBOARD:`, `Sideboard`, `SB: 2 Pyroblast`, le intestazioni `Deck`/`Mainboard` e i suffissi set/numero di collezione degli export Moxfield. Per carte bifronte e split e riconosciuto anche il nome della prima faccia, ricondotto al nome completo Scryfall.

Il posto e assegnato dai tre pannelli A, B e C: inserire ciascun giocatore nel posto scelto. Solo con tre liste conformi compare il pulsante di esportazione; nome del team e nomi dei tre giocatori sono obbligatori per attivarlo. Il file `.txt` UTF-8 contiene intestazioni Markdown, main, `SIDEBOARD:` e separatori `---`, nell'ordine A/B/C.

## Riservatezza

**L'unico servizio esterno ammesso e `api.scryfall.com`, solo per cercare singole carte.** Non vengono inviati file o testi di liste, quantita, main/sideboard, nomi dei giocatori, seating, nome del team o link Moxfield. Ogni GET contiene soltanto un nome di carta nel parametro `exact`. Scryfall vede quindi i nomi cercati e le normali informazioni di rete del browser, non la lista completa con le sue quantita o l'identita del team. Le richieste omettono cookie/credenziali e referrer.

I dati del team restano nella memoria della scheda: niente account, analytics, database o backend. Il ricaricamento perde i dati del team. La sola persistenza e la cache di legalita, senza riferimenti ai mazzi o ai giocatori. L'esportazione genera un Blob locale. Ricomincia richiede conferma e svuota il team, ma conserva le informazioni pubbliche riutilizzabili delle carte.

Codice, crediti, font e immagini non dipendono da CDN. La Content Security Policy permette connessioni alla stessa origine e a `https://api.scryfall.com`, bloccando altri host esterni; le eccezioni WebSocket loopback servono esclusivamente a Vite in sviluppo. Immagini, script e font esterni sono bloccati. Non aggiungere analytics o error reporting che acquisisca i dati del modulo.

### Limite deliberato dell'importazione Moxfield

Moxfield non e tra i servizi esterni consentiti. Il campo quindi **riconosce il link solo localmente, non scarica il mazzo**: l'utente incolla il suo export testuale nello stesso pannello. Non vengono usati proxy ne eseguite richieste a Moxfield.

## Legalita e cache

Non esistono piu cataloghi bulk, snapshot inclusi nella build o script di aggiornamento. Il comando `catalog:update` e stato rimosso insieme al vecchio file globale.

- Voci note: validita massima di **24 ore** dall'ultima risposta Scryfall.
- Nomi non trovati (HTTP 404): cache di **un'ora**, per evitare ricerche ripetute di errori di battitura.
- **Soglia giornaliera alle 19:05 CET (UTC+1 fisso, cioe 18:05 UTC)**: quando la soglia e raggiunta, tutte le risposte ottenute prima di essa scadono anche se il loro TTL non e ancora terminato. Una risposta ottenuta esattamente alla soglia o dopo rimane utilizzabile fino alla soglia successiva, salvo scadenza anticipata del TTL. La regola vale ogni giorno, anche senza un annuncio programmato, per coprire annunci di emergenza e lasciare cinque minuti dall'orario usuale degli annunci.
- CET e interpretato letteralmente come UTC+1 anche in estate, non come l'orario civile europeo CEST (UTC+2). Il calcolo non dipende dal fuso del dispositivo. La stessa regola viene applicata alla cache in memoria, a localStorage e all'indice dello store; la pagina ricontrolla periodicamente le scadenze e sempre immediatamente prima dell'export.
- La cache usa la chiave `trio:card-legality:v1` e salva solo nome canonico/alias, legalita, esistenza e data del controllo. Nessuna quantita, lista, giocatore, link o associazione al team.
- **Aggiorna legalità** ignora e invalida la cache per le carte presenti nelle liste. Se il refresh fallisce, Riprova deve ricontattare Scryfall invece di ripristinare il vecchio esito.
- Durante le richieste, in presenza di errori o quando manca una verifica recente, l'esportazione e bloccata. Le risposte scadute vengono ricontrollate automaticamente; la scadenza e verificata anche immediatamente prima dell'export.
- Senza rete sono riutilizzabili solo le carte gia presenti in cache e non scadute. Un errore HTTP/429 o un timeout non sono mai memorizzati come illegalita.

Una cache e informazioni sempre in tempo reale sono obiettivi diversi: la soglia giornaliera copre gli annunci usuali delle 19:00 CET e quelli di emergenza nello stesso orario, ma non garantisce che Scryfall sia gia aggiornato dopo cinque minuti, ne intercetta immediatamente annunci pubblicati in altri orari. Prima di un torneo usare Aggiorna legalità per ottenere le risposte correnti. La cache non e una certificazione della banlist in tempo reale.

### Errori 429 e CORS su GitHub Pages

HTTP **429** indica che Scryfall sta rifiutando richieste per eccesso di frequenza. Se la risposta di rifiuto non include `Access-Control-Allow-Origin`, il browser segnala anche un errore CORS: JavaScript vede soltanto un fallimento di rete e non puo leggere ne il codice 429 ne `Retry-After`. Non e un errore del base URL Pages e non si risolve aggiungendo header CORS alla richiesta, usando `no-cors` o un proxy.

Il servizio usa un ritmo prudente e al massimo **tre tentativi complessivi**: attese iniziali di 2 e 4 secondi, estese se `Retry-After` indica un intervallo maggiore (in secondi o come data HTTP). Se anche l'ultimo tentativo fallisce, sospende le ulteriori richieste della coda per almeno altri 8 secondi, o per il tempo indicato dal server. Durante questa pausa i dati di cache recenti sono ancora riutilizzabili, ma le carte non verificabili bloccano l'export. Dopo l'attesa usare Riprova; evitare aggiornamenti forzati ripetuti e altre schede che eseguono ricerche contemporaneamente. Un limite applicato all'IP, anche condiviso con altri utenti, puo durare piu del cooldown locale: l'app non puo rimuoverlo.

Timeout e risposte non valide restano errori, non carte illegali. Nessuna lista completa viene inviata e non sono stati introdotti altri servizi esterni. Gli errori CORS opachi possono anche dipendere dalla rete: i retry sono limitati proprio per non insistere su un servizio irraggiungibile.

## Distribuzione

Il sito e configurato per l'URL standard GitHub Pages del repository: `https://daniele-tentoni.github.io/vue-team-trio/`. Il `base` di Vite e `/vue-team-trio/`; collegamenti e richieste ai file statici rispettano `import.meta.env.BASE_URL`. Non e previsto un dominio personalizzato.

### Test automatici

Il workflow `.github/workflows/pull-request.yml` viene eseguito a ogni pull request diretta a `main`, su **ubuntu-latest** con Node.js 24. Installa le dipendenze con `npm ci`, esegue i test unitari con coverage V8 e soglie del 90% per store e servizi, installa **Chromium e Firefox** con le dipendenze Linux ed esegue TypeScript, build e test browser su entrambi i motori. Unit test e build vengono eseguiti una sola volta nello stesso job. La variabile `CI`, gia impostata da GitHub Actions, abilita il secondo progetto Playwright. Le risposte Scryfall sono simulate. Conserva i report coverage e, in caso di errore, gli artefatti Playwright per sette giorni. Il workflow ha solo permessi di lettura del repository; non usa `pull_request_target` o segreti di deploy.

### Pubblicazione su Pages

Il workflow `.github/workflows/deploy-pages.yml` viene eseguito a ogni push su `main` oppure manualmente tramite `workflow_dispatch`. Dopo test unitari, controllo dei tipi e build, carica `dist/` come artefatto Pages e lo pubblica con le azioni ufficiali GitHub. Solo il job di deploy ha i permessi `pages: write` e `id-token: write`; non servono token personali o branch `gh-pages`.

Nel repository GitHub impostare **Settings > Pages > Build and deployment > Source: GitHub Actions**. Dopo il primo push su `main`, il job di deploy espone il collegamento del sito nell'environment `github-pages`. Eventuali regole di protezione dell'environment possono richiedere approvazione.

### Contribuire

In fondo alla pagina sono sempre presenti i collegamenti fissi al repository [Daniele-Tentoni/vue-team-trio](https://github.com/Daniele-Tentoni/vue-team-trio), alle sue [issue](https://github.com/Daniele-Tentoni/vue-team-trio/issues) e alle [pull request](https://github.com/Daniele-Tentoni/vue-team-trio/pulls). Per clonare: `git clone https://github.com/Daniele-Tentoni/vue-team-trio.git`.

L'indirizzo non dipende da variabili d'ambiente o dal repository del workflow: locale e produzione mostrano gli stessi link. I link si aprono solo su azione dell'utente, in una nuova scheda e senza referrer; non vengono eseguite richieste automatiche a GitHub e non vengono trasmessi i dati del team.

`public/404.html` viene copiato nella build e reindirizza gli URL inesistenti a `/vue-team-trio/`, con link alternativo. Usa un meta refresh, senza JavaScript inline e senza richieste a servizi esterni. I percorsi sconosciuti, le query e i frammenti vengono scartati: l'app attuale ha una sola pagina e non usa un router. Se si rinomina il repository, aggiornare insieme `base` di Vite, destinazione della 404 e URL dei test Playwright.

Pubblicare solo `dist/`, senza backend o servizi di raccolta. Non e previsto un service worker per ricaricare il sito senza rete. Un'eventuale CSP negli header HTTP dell'hosting deve permettere `connect-src https://api.scryfall.com` oltre alla stessa origine; non aggiungere altri host esterni. Le immagini e i crediti rimangono locali.

## Crediti

Dati pubblici da [Scryfall Cards Named](https://scryfall.com/docs/api/cards/named). Magic: The Gathering e le illustrazioni sono di Wizards of the Coast e dei rispettivi artisti. Il credito dell'immagine e incluso nell'app e in `public/art-credit.json`. Progetto indipendente non affiliato a Wizards of the Coast, Scryfall o Moxfield.
