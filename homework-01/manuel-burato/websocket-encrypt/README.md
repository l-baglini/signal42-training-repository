# websocket-encrypt

> POC **didattico** per workshop: un canale WebSocket dove, dopo un breve handshake,
> client e server si scambiano messaggi **cifrati in entrambe le direzioni**.
>
> ⚠️ **Non è codice di produzione.** Vedi [Limiti noti](#limiti-noti).

L'obiettivo è essere *trasparenti*: si vede il **ciphertext sul filo** e il **plaintext**
solo dopo la decifratura. Tutto in TypeScript, impacchettato come libreria npm e usato da
due piccole app di test (client e server).

---

## L'idea: cifratura ibrida (come TLS)

Gli algoritmi **asimmetrici** (RSA) non cifrano flussi: sono lenti e gestiscono pochi byte
per operazione. Quindi:

1. usiamo l'**asimmetrico (RSA-OAEP)** *solo* per consegnare in sicurezza una **chiave simmetrica AES**;
2. poi tutto il traffico viaggia cifrato con **AES-256-GCM**, veloce e senza limiti di dimensione.

```
  RSA-OAEP  ──>  consegna la chiave AES (una volta, nell'handshake)
  AES-256-GCM ─> cifra tutti i messaggi (sempre, bidirezionale)
```

## Scelte crittografiche

| Cosa | Scelta | Perché |
|------|--------|--------|
| Cifrario dati | **AES-256-GCM** | AEAD: confidenzialità **+** integrità. Un byte alterato → decifratura fallisce. (No CBC: niente integrità, padding oracle.) |
| Nonce / IV | **12 byte casuali per OGNI messaggio** | Riusare un nonce con la stessa chiave rompe GCM. Si antepone al ciphertext (non è segreto, deve solo essere unico). |
| Tag di autenticazione | **16 byte** | Prodotto e verificato dal cifrario (`getAuthTag` / `setAuthTag`). |
| Scambio chiave AES | **RSA-OAEP (SHA-256), RSA 2048 bit** | Il modo più diretto e *built-in* di "cifrare la chiave e spedirla". |

Tutto è costruito sul modulo `crypto` di Node; l'unica dipendenza runtime è [`ws`](https://www.npmjs.com/package/ws).

## Handshake

```
client                                             server
  │  ── apre la WebSocket ─────────────────────────▶ │
  │                                                   │
  │  genera coppia RSA                                │
  │  ── { type:"client-pubkey", key:<PEM> } ────────▶ │
  │                                                   │  genera chiave AES-256 casuale
  │                                                   │  la cifra con la pubblica del client (RSA-OAEP)
  │  ◀──────── { type:"session-key", key:<b64> } ──── │
  │  decifra con la propria privata                   │
  │                                                   │
  │  ====  ora condividono la STESSA chiave AES  ==== │
  │  ◀── { type:"data", payload:<b64> } ───────────▶  │   (bidirezionale, AES-256-GCM)
```

Solo il client, con la sua chiave privata, può sciogliere la `session-key`: è "la sua chiave per leggere".

## Formato sul filo

- **Handshake**: JSON in chiaro (contiene solo chiavi pubbliche e la chiave AES *già cifrata*).
- **Dati**: `{ "type": "data", "payload": <base64> }` dove il payload è:

  ```
  nonce[12]  ++  ciphertext[...]  ++  tag[16]
  ```

  Chi riceve: decodifica base64, stacca i primi 12 byte (nonce) e gli ultimi 16 (tag),
  il resto è il ciphertext, poi `AES-256-GCM decrypt` (che verifica il tag).

---

## Installazione e uso

```bash
npm install        # installa ws + toolchain
npm run build      # compila la libreria in dist/
npm test           # round-trip cripto + handshake end-to-end (12 test)
```

### Provare la demo (due terminali)

```bash
# terminale 1
npm run example:server

# terminale 2
npm run example:client
```

Vedrai, per ogni messaggio, sia il **blob cifrato** (con nonce/ciphertext/tag evidenziati)
sia il **plaintext** dopo la decifratura, in **entrambe le direzioni**. Le due "fingerprint"
della chiave di sessione stampate dai due lati devono coincidere.

### Demo di manomissione (integrità)

```bash
npm run demo:tamper
```

Cifra un messaggio, lo decifra correttamente, poi altera **un solo bit** del ciphertext (e del
tag): GCM **rifiuta** la decifratura. È la prova dell'integrità autenticata.

---

## API della libreria

```ts
import { SecureWebSocketServer, SecureWebSocketClient } from "websocket-encrypt";

// --- server ---
const server = new SecureWebSocketServer({ port: 8080 });
server.on("connection", (session) => {
  session.on("message", (text) => {
    console.log("ricevuto:", text);
    session.send("ciao dal server");     // bidirezionale
  });
});

// --- client ---
const client = new SecureWebSocketClient("ws://localhost:8080");
client.on("secure", (session) => {       // handshake completato
  session.send("ciao dal client");
  session.on("message", (text) => console.log("risposta:", text));
});
```

### `SecureSession` (canale dopo l'handshake)

| Membro | Tipo | Descrizione |
|--------|------|-------------|
| `send(text)` | `(string) => void` | cifra e invia un messaggio `data` |
| `close()` | `() => void` | chiude la connessione |
| `keyFingerprint` | `string` | impronta della chiave di sessione (per verificare a occhio che i due lati coincidano) |
| evento `message` | `(plaintext: string)` | testo decifrato e autenticato |
| evento `wire-out` | `(base64)` | blob cifrato che **esce** (per la demo) |
| evento `wire-in` | `(base64)` | blob cifrato che **entra** (per la demo) |
| evento `error` | `(Error)` | es. tag GCM non valido → **manomissione** |
| evento `close` | — | connessione chiusa |

Sono esportate anche le primitive (`aesEncrypt`, `aesDecrypt`, `rsaWrapKey`, `rsaUnwrapKey`,
`generateAesKey`, `generateRsaKeyPair`, `deriveDirectionalKey`, …) per scopi didattici e per i test.

---

## Struttura del progetto

```
src/                       # la libreria
  crypto.ts                #   primitive: AES-256-GCM, RSA-OAEP, HKDF
  protocol.ts              #   tipi dei messaggi + (de)serializzazione
  secure-session.ts        #   canale cifrato bidirezionale (post-handshake)
  server.ts                #   SecureWebSocketServer (lato server dell'handshake)
  client.ts                #   SecureWebSocketClient (lato client dell'handshake)
  index.ts                 #   API pubblica
examples/                  # le due app di test (usano la libreria come pacchetto npm)
  server.ts  client.ts  tamper-demo.ts
test/                      # node:test — cripto + handshake end-to-end
```

---

## Variante "più pulita": due chiavi con HKDF (opzionale)

Nel POC usiamo **la stessa chiave AES nelle due direzioni**, con nonce casuale per messaggio:
a scala POC va benissimo. La variante più pulita deriva **due chiavi, una per direzione**, con
**HKDF** a partire dalla chiave condivisa, così le due direzioni non condividono lo spazio dei nonce:

```ts
import { deriveDirectionalKey } from "websocket-encrypt";

const c2s = deriveDirectionalKey(shared, "client-to-server");
const s2c = deriveDirectionalKey(shared, "server-to-client");
```

La funzione è già inclusa (e testata) per poterla mostrare a voce durante il workshop.

---

## Limiti noti

Da **dire al workshop**, non da "risolvere" nel POC:

- **Nessuna autenticazione del peer.** Un man-in-the-middle può sostituire le chiavi pubbliche
  durante l'handshake. Il POC dà **confidenzialità, non identità**.
- **Nessuna forward secrecy** (RSA-wrap). Se in futuro trapela la chiave privata, il traffico
  passato *registrato* diventa decifrabile.

In **produzione** queste cose non si fanno a mano:

- **TLS / mTLS** (lo standard per il trasporto);
- **Noise Protocol Framework** — handshake + trasporto pronti, mutua autenticazione e forward
  secrecy (lo usano WhatsApp e WireGuard);
- **ECDH X25519 + HKDF** per la forward secrecy.

Per il workshop restiamo su **RSA-OAEP + AES-GCM** perché è il più trasparente da spiegare.
