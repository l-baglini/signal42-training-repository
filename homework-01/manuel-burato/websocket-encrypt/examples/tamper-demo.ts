/**
 * Demo di MANOMISSIONE (test di integrità autenticata di AES-256-GCM).
 *
 * Non serve la rete: usiamo direttamente le primitive della libreria.
 *   1. cifriamo un messaggio e lo decifriamo correttamente;
 *   2. alteriamo UN solo byte del ciphertext e proviamo a decifrare:
 *      GCM verifica il tag di autenticazione e la decifratura FALLISCE.
 *
 * Avvio:  npm run demo:tamper
 */

import {
  AUTH_TAG_BYTES,
  NONCE_BYTES,
  aesDecrypt,
  aesEncrypt,
  generateAesKey,
} from "websocket-encrypt";

import { color as col } from "./format";

const key = generateAesKey();
const plaintext = "Bonifico di 100€ a Alice";

console.log(col.bold("\n🔐 Demo integrità AES-256-GCM\n"));
console.log("plaintext originale:", col.bold(plaintext));

// 1) Giro pulito: cifra → decifra. Deve funzionare.
const blob = aesEncrypt(key, Buffer.from(plaintext, "utf8"));
const recovered = aesDecrypt(key, blob).toString("utf8");
console.log(col.green("\n[1] decifratura del blob integro → OK:"), col.bold(recovered));

// 2) Manomissione: ribaltiamo un bit di UN byte nel ciphertext.
//    (saltiamo il nonce iniziale, restiamo prima del tag finale)
const tampered = Buffer.from(blob);
const target = NONCE_BYTES + Math.floor((tampered.length - NONCE_BYTES - AUTH_TAG_BYTES) / 2);
const before = tampered[target];
tampered[target] ^= 0x01; // un solo bit cambiato
console.log(
  col.yellow(`\n[2] altero 1 bit del ciphertext (byte #${target}: 0x${before.toString(16)} → 0x${tampered[target].toString(16)})`),
);

try {
  const out = aesDecrypt(key, tampered).toString("utf8");
  // Non dovremmo mai arrivare qui.
  console.log(col.red("    ✗ ATTESO un fallimento, invece ha decifrato:"), out);
  process.exitCode = 1;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.log(col.green("    ✓ decifratura RIFIUTATA come previsto:"), col.dim(message));
}

// 3) Per simmetria: alteriamo il tag di autenticazione. Anche questo deve fallire.
const tamperedTag = Buffer.from(blob);
tamperedTag[tamperedTag.length - 1] ^= 0x01;
try {
  aesDecrypt(key, tamperedTag);
  console.log(col.red("\n[3] ✗ ATTESO un fallimento alterando il tag, invece è passata."));
  process.exitCode = 1;
} catch {
  console.log(col.green("\n[3] ✓ anche alterando il tag di autenticazione la decifratura è RIFIUTATA."));
}

console.log(col.dim("\nMorale: con GCM, confidenzialità E integrità insieme. Un byte cambiato = messaggio scartato.\n"));
