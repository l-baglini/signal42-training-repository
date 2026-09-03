/**
 * crypto.ts — primitive crittografiche del POC.
 *
 * Idea generale (cifratura IBRIDA, lo stesso principio del TLS):
 *   - RSA è asimmetrico, lento e cifra pochi byte: lo usiamo SOLO per consegnare
 *     in sicurezza una chiave simmetrica.
 *   - AES-256-GCM è simmetrico, veloce e senza limiti di dimensione: lo usiamo per
 *     cifrare tutto il traffico vero e proprio.
 *
 * Tutto è costruito sul modulo `crypto` built-in di Node, nessuna dipendenza esterna.
 */

import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  KeyObject,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Parametri del cifrario. Sono costanti esplicite, così il "contratto sul filo"
// è leggibile in un colpo d'occhio.
// ---------------------------------------------------------------------------

/** AES-256 → chiave da 32 byte. */
export const AES_KEY_BYTES = 32;

/** Nonce/IV di GCM: 12 byte. È la dimensione raccomandata per GCM. */
export const NONCE_BYTES = 12;

/** Tag di autenticazione GCM: 16 byte (il massimo, ed è quello che vogliamo). */
export const AUTH_TAG_BYTES = 16;

/** Dimensione della chiave RSA. 2048 è il minimo ragionevole; il brief dice "2048+". */
export const RSA_MODULUS_BITS = 2048;

const AES_ALGORITHM = "aes-256-gcm";

// ---------------------------------------------------------------------------
// RSA — usato solo per "incartare" (wrap) la chiave AES.
// ---------------------------------------------------------------------------

export interface RsaKeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

/** Genera una coppia di chiavi RSA (per il client, nell'handshake). */
export function generateRsaKeyPair(bits: number = RSA_MODULUS_BITS): RsaKeyPair {
  return generateKeyPairSync("rsa", { modulusLength: bits });
}

/** Esporta una chiave pubblica in PEM (testo) per spedirla sul filo in chiaro. */
export function exportPublicKeyPem(publicKey: KeyObject): string {
  return publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
}

/** Reimporta una chiave pubblica ricevuta in PEM. */
export function importPublicKeyPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

/**
 * Cifra (wrap) la chiave AES con la chiave pubblica RSA del destinatario,
 * usando RSA-OAEP con SHA-256 (padding moderno e sicuro; NON usare PKCS#1 v1.5).
 * Solo chi possiede la chiave privata corrispondente potrà recuperarla.
 */
export function rsaWrapKey(recipientPublicKey: KeyObject, aesKey: Buffer): Buffer {
  return publicEncrypt(
    {
      key: recipientPublicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey,
  );
}

/** Decifra (unwrap) la chiave AES con la propria chiave privata RSA. */
export function rsaUnwrapKey(privateKey: KeyObject, wrapped: Buffer): Buffer {
  return privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    wrapped,
  );
}

// ---------------------------------------------------------------------------
// AES-256-GCM — cifra TUTTI i messaggi dati, in entrambe le direzioni.
//
// GCM è un cifrario AEAD (Authenticated Encryption with Associated Data):
// garantisce insieme confidenzialità E integrità. Se anche un solo byte del
// ciphertext (o del tag) viene alterato, la decifratura FALLISCE con eccezione.
// ---------------------------------------------------------------------------

/** Genera una chiave AES-256 casuale (per il server, nell'handshake). */
export function generateAesKey(): Buffer {
  return randomBytes(AES_KEY_BYTES);
}

/**
 * Cifra `plaintext` e restituisce un singolo blob auto-contenuto:
 *
 *      nonce[12] ++ ciphertext[...] ++ tag[16]
 *
 * Il nonce è casuale e NUOVO a ogni messaggio: riusarlo con la stessa chiave
 * romperebbe la sicurezza di GCM. Lo anteponiamo in chiaro perché serve al
 * destinatario per decifrare (non è un segreto, deve solo essere unico).
 */
export function aesEncrypt(key: Buffer, plaintext: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 byte, prodotto dal cifrario.

  return Buffer.concat([nonce, ciphertext, tag]);
}

/**
 * Operazione inversa di {@link aesEncrypt}. Sfila nonce e tag dal blob, poi
 * decifra e VERIFICA il tag. Lancia un errore se l'autenticazione fallisce
 * (messaggio manomesso o chiave sbagliata).
 */
export function aesDecrypt(key: Buffer, blob: Buffer): Buffer {
  if (blob.length < NONCE_BYTES + AUTH_TAG_BYTES) {
    throw new Error("blob cifrato troppo corto: nonce o tag mancanti");
  }

  const nonce = blob.subarray(0, NONCE_BYTES);
  const tag = blob.subarray(blob.length - AUTH_TAG_BYTES);
  const ciphertext = blob.subarray(NONCE_BYTES, blob.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv(AES_ALGORITHM, key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(tag);

  // .final() è il punto in cui GCM verifica il tag: se non torna, throwa qui.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Utility didattiche.
// ---------------------------------------------------------------------------

/**
 * "Impronta" breve di una chiave (primi byte dello SHA-256, in hex). Serve solo
 * alla demo per mostrare a colpo d'occhio che i due lati condividono la STESSA
 * chiave AES, senza mai stampare la chiave vera.
 */
export function keyFingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Variante "più pulita" (opzionale) citata nel brief: da un'unica chiave
 * condivisa si derivano DUE chiavi, una per direzione, con HKDF. Così le due
 * direzioni non condividono lo spazio dei nonce. Non è usata di default nel POC,
 * ma è qui per poterla mostrare al workshop.
 */
export function deriveDirectionalKey(sharedKey: Buffer, label: string): Buffer {
  const derived = hkdfSync(
    "sha256",
    sharedKey,
    Buffer.alloc(0), // salt vuoto: per il POC va bene
    Buffer.from(label, "utf8"), // "info": separa i contesti (es. "c2s" / "s2c")
    AES_KEY_BYTES,
  );
  return Buffer.from(derived);
}
