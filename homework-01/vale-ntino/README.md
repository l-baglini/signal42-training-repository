# Cruciverba — generatore offline (WebLLM)

Generatore di cruciverba bilingue (IT/EN) che gira **interamente nel browser**: un modello LLM open-source (via WebLLM + WebGPU) sceglie le parole legate ai tuoi temi e ne scrive le definizioni, un algoritmo a incastro monta la griglia, e ottieni un cruciverba che puoi **risolvere a schermo** (anche da smartphone o tablet) oppure **stampare**. Nessun server, nessuna API, nessuna chiave: dopo il primo download del modello funziona anche **senza internet**.

File principale: `crossword-offline-webllm.html` (un unico file autonomo, niente da installare).

---

## Requisiti

- **Browser con WebGPU**: Chrome o Edge aggiornati (i più affidabili). Puoi verificare su `chrome://gpu` o su webgpureport.org.
- Un **piccolo server HTTP locale** per servire il file (vedi sotto). Il doppio clic sul file **non basta**.
- ~1–2 GB liberi per la cache del modello (solo la prima volta).

## Come avviarlo

1. Metti `crossword-offline-webllm.html` in una cartella.
2. Apri un terminale in quella cartella e avvia un server statico, ad esempio:
   - **Python**: `python3 -m http.server 8000`
   - **Node**: `npx serve`
   - oppure l'estensione **Live Server** di VS Code.
3. Nel browser vai su `http://localhost:8000/crossword-offline-webllm.html`.
4. Premi **Carica modello**: la prima volta scarica i pesi (~1 GB per il modello base) con barra di avanzamento; poi restano in cache.
5. Scrivi le **parole-tema** (es. `mare, vacanza, sole`), scegli lingua, numero di parole e difficoltà, quindi **Genera**.
6. **Stampa / PDF**: produce griglia + definizioni; la soluzione esce su una pagina separata.

> **Perché serve il server?** I browser bloccano l'import dei moduli ES quando la pagina è aperta come `file://` (errore CORS). Servendola via `http://localhost`, l'import di WebLLM funziona.

Senza GPU o connessione: il pulsante **Prova con un esempio (senza AI)** genera una griglia da una lista già inclusa nel file. Comoda come riserva durante una demo.

## Risolverlo a schermo (anche da smartphone/tablet)

Una volta generato, il cruciverba è compilabile direttamente nella pagina:

- **Tocca** (o clicca) una casella e **scrivi**: su telefono/tablet compare la tastiera.
- **Ritocca la stessa casella** per girare tra orizzontale e verticale; la parola attiva si evidenzia.
- Frecce e Backspace per muoverti e correggere (da tastiera fisica).
- **Verifica** segna in rosso le lettere sbagliate; **Cancella** svuota la griglia.
- **Mostra soluzione** rivela tutte le risposte.

La stampa resta invariata: produce una griglia **vuota** (le risposte digitate non vengono stampate) più la soluzione su una pagina separata.

## Modelli disponibili (menu "Modello AI")

| Modello | Dimensione | Note |
|---|---|---|
| Llama 3.2 1B (q4f32) | ~1.1 GB | Default: veloce, massima compatibilità (non richiede shader f16) |
| Qwen 2.5 1.5B (q4f16) | ~1.3 GB | Più forte in italiano |
| Llama 3.2 3B (q4f16) | ~2.3 GB | Qualità migliore, download maggiore |

Gli ID dei modelli vengono **validati a runtime** contro l'elenco di WebLLM; se uno non è disponibile, l'app ripiega automaticamente su un modello piccolo equivalente.

---

## Dettagli implementativi

Tutto in un solo file HTML, senza passo di build e senza dipendenze da installare. Il codice si divide in tre blocchi.

**1. Generazione parole/definizioni (LLM in locale).** La libreria WebLLM (`@mlc-ai/web-llm`) viene caricata dal CDN con un `import()` **dinamico**: così l'interfaccia e l'esempio restano usabili anche se la libreria non parte. Il motore si crea con `CreateMLCEngine` passando un callback di progresso (la barra di download). La richiesta usa l'API stile OpenAI (`engine.chat.completions.create`) con `response_format: { type: "json_object" }`; il prompt chiede un oggetto nella forma `{"words":[{"word","clue"}]}` con regole esplicite (parole legate ad almeno uno dei temi, singole, senza accenti, definizione che non contiene la parola). Un parser JSON tollerante accetta sia oggetti sia array e ignora eventuale testo di troppo — utile coi modelli piccoli, meno precisi nel rispettare il formato.

**2. Disposizione a incastro (criss-cross).** Le parole vengono ordinate dalla più lunga alla più corta; la prima va al centro. Per ogni parola successiva si provano tutti gli incroci possibili — ogni lettera in comune con la griglia, sia in orizzontale sia in verticale — e si validano: nessun conflitto di lettere, celle vuote prima e dopo la parola (per non creare parole "fantasma" attaccate), e celle perpendicolari libere dove non c'è un incrocio voluto. Ogni piazzamento riceve un punteggio (più incroci, meno crescita del riquadro) e si eseguono ~80 tentativi randomizzati, tenendo quello che incastra più parole. Infine: normalizzazione delle coordinate, numerazione delle celle in ordine di scansione e costruzione delle liste Orizzontali/Verticali.

**3. Rendering, gioco interattivo e stampa.** La griglia è disegnata con CSS grid (celle "piene" bianche con numero, le altre trasparenti, stile criss-cross). Passare il mouse su una definizione evidenzia in giallo le celle corrispondenti. Per la compilazione a schermo, ogni casella mostra uno span per la risposta dell'utente; il tocco imposta la cella attiva ed evidenzia la parola corrente, e per far comparire la tastiera su mobile — dato che le celle non sono campi nativi — un singolo `<input>` nascosto riceve il focus al tocco e cattura i tasti (gestendo lettera, Backspace e frecce). "Verifica" confronta le risposte con la soluzione; "Cancella" le svuota. La stampa sfrutta il dialogo del browser: nasconde controlli e risposte digitate, stampa la griglia vuota e manda la soluzione su una seconda pagina (`break-before: page`), quindi "Salva come PDF" produce il file.

**Altri dettagli.** Le parole vengono normalizzate (accenti rimossi, maiuscole, solo A–Z), deduplicate e filtrate per lunghezza (3–13 lettere). Interfaccia e lingua di generazione sono entrambe commutabili IT/EN. Nessun dato lascia il dispositivo: dopo il download iniziale, tutto avviene in locale.

## Limiti noti

- I modelli piccoli in-browser danno definizioni più semplici e talvolta imperfette; per più qualità, scegli un modello più grande.
- La prima generazione include il download del modello: può richiedere qualche minuto a seconda della connessione.
- Se si incastrano poche parole, rigenera o cambia i temi.
- Richiede WebGPU: su hardware o driver datati potrebbe non partire (in quel caso, usa l'esempio).
- Su alcune tastiere Android il tasto cancella può essere poco prevedibile; in alternativa, tocca la cella e riscrivi sopra.

## Varianti

Esiste anche una versione **cloud** (`crossword-generator.html`) che usa Claude come generatore: definizioni di qualità più alta, ma richiede internet e l'autenticazione disponibile solo eseguendola come artifact dentro Claude.ai.

## Crediti

Cruciverba costruito interamente tramite AI. Inferenza locale con **WebLLM** (progetto MLC-AI); modelli **Llama 3.2** (Meta) e **Qwen 2.5** (Alibaba) in formato MLC.
