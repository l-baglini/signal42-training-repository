/**
 * format.ts — solo helper di stampa per le demo (niente crittografia).
 * Servono a rendere visibile la differenza tra ciphertext "sul filo" e plaintext.
 */

import { AUTH_TAG_BYTES, NONCE_BYTES } from "websocket-encrypt";

// Colori ANSI minimali per leggere meglio l'output a terminale.
const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export { c as color };

/** Tronca una stringa lunga (es. il base64) per non intasare il terminale. */
export function short(value: string, max = 64): string {
  return value.length <= max ? value : `${value.slice(0, max)}… (${value.length} ch)`;
}

/**
 * Scompone il blob `nonce ++ ciphertext ++ tag` per mostrarne la struttura.
 * È esattamente ciò che fa il destinatario prima di decifrare.
 */
export function describeWire(payloadBase64: string): string {
  const blob = Buffer.from(payloadBase64, "base64");
  const nonce = blob.subarray(0, NONCE_BYTES);
  const tag = blob.subarray(blob.length - AUTH_TAG_BYTES);
  const ciphertext = blob.subarray(NONCE_BYTES, blob.length - AUTH_TAG_BYTES);

  return [
    `${blob.length} byte totali`,
    `nonce(12)=${nonce.toString("hex")}`,
    `ct(${ciphertext.length})=${short(ciphertext.toString("hex"), 32)}`,
    `tag(16)=${tag.toString("hex")}`,
  ].join("  ");
}
