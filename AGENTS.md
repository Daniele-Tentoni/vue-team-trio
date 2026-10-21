# Istruzioni per gli agenti

## Strategia di verifica

- Non eseguire automaticamente la suite e2e completa a ogni prompt.
- Per modifiche piccole, eseguire i test mirati alla parte modificata e il controllo TypeScript quando pertinente.
- Per modifiche alla UI o ai flussi utente, eseguire soltanto gli e2e pertinenti ai comportamenti interessati.
- Prima del merge, affidare la suite completa al workflow GitHub Actions delle pull request verso `main`. Eseguirla anche localmente solo su richiesta esplicita o quando un rischio concreto lo giustifica.
- Per sole modifiche a documentazione o istruzioni, verificarne contenuto e diagnostiche senza eseguire test applicativi, build o browser.
- Evitare controlli ripetuti o aggiuntivi senza un rischio specifico da verificare, per ridurre tempi e consumo di crediti.
- Nel riepilogo indicare i controlli effettivamente eseguiti e gli eventuali limiti di verifica. Non dichiarare superati test non eseguiti.

## Server locali

- Non avviare automaticamente il server dev, nemmeno al termine dei test: deve avviarlo manualmente l'utente.
- Quando servono e2e, usare la preview temporanea prevista dalla configurazione Playwright e assicurarsi che venga chiusa al termine.
