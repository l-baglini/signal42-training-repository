/**
 * App di test — CLIENT.
 *
 * Si connette al server, completa l'handshake e invia alcuni messaggi cifrati.
 * Per ognuno stampa plaintext e ciphertext; per le risposte del server stampa il
 * ciphertext ricevuto e il plaintext decifrato. Mostra il canale BIDIREZIONALE.
 *
 * Avvio:  npm run example:client   (con il server già avviato)
 */

import { SecureWebSocketClient } from "websocket-encrypt";

import { color as col, describeWire, short } from "./format";

const PORT = Number(process.env.PORT ?? 8080);
const URL = process.env.URL ?? `ws://localhost:${PORT}`;

const MESSAGES = ["Ciao server 👋", "questo viaggia cifrato", "AES-256-GCM ✨"];

const client = new SecureWebSocketClient(URL);

client.on("open", () => console.log(col.dim(`\n…connesso a ${URL}, avvio handshake (invio pubblica RSA)`)));

client.on("secure", (session) => {
  console.log(col.green("🤝 Handshake completato (lato client)."));
  console.log(col.dim(`   chiave di sessione AES → fingerprint ${session.keyFingerprint}`));
  console.log(col.dim("   (deve coincidere con quella del server)\n"));

  // --- risposte dal server: ciphertext sul filo, poi plaintext ---
  session.on("wire-in", (payload) => {
    console.log(col.yellow("⬇  WIRE IN  (ciphertext):"), col.dim(short(payload)));
    console.log(col.dim(`             ${describeWire(payload)}`));
  });

  let received = 0;
  session.on("message", (text) => {
    console.log(col.cyan("   DECIFRATO  (plaintext): ") + col.bold(text) + "\n");

    // Quando ho ricevuto tutte le risposte, chiudo: demo finita.
    if (++received === MESSAGES.length) {
      console.log(col.green("✅ Tutti i messaggi inviati e tutte le risposte decifrate. Chiudo."));
      session.close();
    }
  });

  // --- invio: plaintext, poi ciphertext sul filo ---
  session.on("wire-out", (payload) => {
    console.log(col.yellow("⬆  WIRE OUT (ciphertext):"), col.dim(short(payload)));
    console.log(col.dim(`             ${describeWire(payload)}`));
  });

  for (const text of MESSAGES) {
    console.log(col.cyan("   DA INVIARE (plaintext): ") + col.bold(text));
    session.send(text);
  }

  session.on("error", (err) => console.error(col.red("⚠  errore di sessione:"), err.message));
});

client.on("error", (err) => console.error(col.red("⚠  errore client:"), err.message));
client.on("close", () => {
  console.log(col.dim("\n🔌 connessione chiusa."));
  process.exit(0);
});
