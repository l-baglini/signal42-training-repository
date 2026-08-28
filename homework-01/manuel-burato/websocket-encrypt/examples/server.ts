/**
 * App di test — SERVER.
 *
 * Avvia un server cifrato, attende l'handshake e poi parla in modo bidirezionale
 * con il client: per ogni messaggio ricevuto stampa il ciphertext "sul filo" e il
 * plaintext decifrato, poi risponde (anch'esso cifrato).
 *
 * Avvio:  npm run example:server   (in un terminale)
 *         npm run example:client   (in un altro)
 */

import { SecureWebSocketServer } from "websocket-encrypt";

import { color as col, describeWire, short } from "./format";

const PORT = Number(process.env.PORT ?? 8080);

const server = new SecureWebSocketServer({ port: PORT });

server.on("listening", () => {
  console.log(col.bold(`\n🔌 Server in ascolto su ws://localhost:${PORT}`));
  console.log(col.dim("   In attesa dell'handshake del client…\n"));
});

server.on("connection", (session) => {
  console.log(col.green("🤝 Handshake completato (lato server)."));
  console.log(col.dim(`   chiave di sessione AES → fingerprint ${session.keyFingerprint}\n`));

  // --- ricezione: ciphertext sul filo, poi plaintext decifrato ---
  session.on("wire-in", (payload) => {
    console.log(col.yellow("⬇  WIRE IN  (ciphertext):"), col.dim(short(payload)));
    console.log(col.dim(`             ${describeWire(payload)}`));
  });

  session.on("message", (text) => {
    console.log(col.cyan("   DECIFRATO  (plaintext): ") + col.bold(text));

    // --- risposta: bidirezionale, cifrata con la stessa chiave ---
    const reply = `ricevuto "${text}" — ciao dal server!`;
    console.log(col.cyan("\n   DA INVIARE (plaintext): ") + col.bold(reply));
    session.send(reply);
  });

  session.on("wire-out", (payload) => {
    console.log(col.yellow("⬆  WIRE OUT (ciphertext):"), col.dim(short(payload)));
    console.log(col.dim(`             ${describeWire(payload)}\n`));
  });

  session.on("error", (err) => console.error(col.red("⚠  errore di sessione:"), err.message));
  session.on("close", () => console.log(col.dim("🔌 connessione chiusa dal client.\n")));
});

server.on("handshake-error", (err) =>
  console.error(col.red("⚠  handshake fallito:"), err.message),
);
server.on("error", (err) => console.error(col.red("⚠  errore del server:"), err.message));

process.on("SIGINT", () => {
  console.log(col.dim("\nchiusura server…"));
  server.close(() => process.exit(0));
});
