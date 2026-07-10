/**
 * Test delle primitive crittografiche (AES-256-GCM e RSA-OAEP).
 * Eseguiti con il test runner integrato di Node (`node:test`), nessuna dipendenza.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_TAG_BYTES,
  NONCE_BYTES,
  aesDecrypt,
  aesEncrypt,
  deriveDirectionalKey,
  generateAesKey,
  generateRsaKeyPair,
  exportPublicKeyPem,
  importPublicKeyPem,
  rsaUnwrapKey,
  rsaWrapKey,
} from "websocket-encrypt";

test("AES-GCM: round-trip restituisce il plaintext originale", () => {
  const key = generateAesKey();
  const plaintext = Buffer.from("messaggio segreto 🤫", "utf8");

  const blob = aesEncrypt(key, plaintext);
  const recovered = aesDecrypt(key, blob);

  assert.deepEqual(recovered, plaintext);
});

test("AES-GCM: il blob ha forma nonce(12) ++ ciphertext ++ tag(16)", () => {
  const key = generateAesKey();
  const plaintext = Buffer.from("12345", "utf8"); // 5 byte

  const blob = aesEncrypt(key, plaintext);

  // 12 (nonce) + 5 (ciphertext, GCM è stream → stessa lunghezza) + 16 (tag) = 33
  assert.equal(blob.length, NONCE_BYTES + plaintext.length + AUTH_TAG_BYTES);
});

test("AES-GCM: ogni messaggio usa un nonce diverso (blob diversi)", () => {
  const key = generateAesKey();
  const plaintext = Buffer.from("stesso testo", "utf8");

  const a = aesEncrypt(key, plaintext);
  const b = aesEncrypt(key, plaintext);

  // I primi 12 byte (nonce) devono differire → niente riuso di nonce.
  assert.notDeepEqual(a.subarray(0, NONCE_BYTES), b.subarray(0, NONCE_BYTES));
  assert.notDeepEqual(a, b);
});

test("AES-GCM: alterare un byte del ciphertext fa fallire la decifratura", () => {
  const key = generateAesKey();
  const blob = aesEncrypt(key, Buffer.from("dati importanti", "utf8"));

  const tampered = Buffer.from(blob);
  tampered[NONCE_BYTES + 1] ^= 0x01; // un bit nel ciphertext

  assert.throws(() => aesDecrypt(key, tampered));
});

test("AES-GCM: alterare il tag di autenticazione fa fallire la decifratura", () => {
  const key = generateAesKey();
  const blob = aesEncrypt(key, Buffer.from("dati importanti", "utf8"));

  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 0x01; // un bit nel tag

  assert.throws(() => aesDecrypt(key, tampered));
});

test("AES-GCM: una chiave sbagliata non decifra", () => {
  const blob = aesEncrypt(generateAesKey(), Buffer.from("ciao", "utf8"));
  assert.throws(() => aesDecrypt(generateAesKey(), blob));
});

test("AES-GCM: blob troppo corto viene rifiutato", () => {
  assert.throws(() => aesDecrypt(generateAesKey(), Buffer.alloc(10)));
});

test("RSA-OAEP: wrap con la pubblica, unwrap con la privata (anche via PEM)", () => {
  const { publicKey, privateKey } = generateRsaKeyPair();
  const aesKey = generateAesKey();

  // Simuliamo il giro sul filo: la pubblica passa come PEM.
  const pem = exportPublicKeyPem(publicKey);
  const reimported = importPublicKeyPem(pem);

  const wrapped = rsaWrapKey(reimported, aesKey);
  const unwrapped = rsaUnwrapKey(privateKey, wrapped);

  assert.deepEqual(unwrapped, aesKey);
});

test("RSA-OAEP: la chiave privata sbagliata non scioglie il wrap", () => {
  const { publicKey } = generateRsaKeyPair();
  const other = generateRsaKeyPair();
  const wrapped = rsaWrapKey(publicKey, generateAesKey());

  assert.throws(() => rsaUnwrapKey(other.privateKey, wrapped));
});

test("HKDF: le due direzioni derivano chiavi diverse dalla stessa chiave condivisa", () => {
  const shared = generateAesKey();
  const c2s = deriveDirectionalKey(shared, "client-to-server");
  const s2c = deriveDirectionalKey(shared, "server-to-client");

  assert.equal(c2s.length, 32);
  assert.notDeepEqual(c2s, s2c);
  // Deterministica: stessa label → stessa chiave.
  assert.deepEqual(c2s, deriveDirectionalKey(shared, "client-to-server"));
});
