/**
 * websocket-encrypt — POC didattico di canale WebSocket con cifratura ibrida
 * bidirezionale (RSA-OAEP per consegnare la chiave + AES-256-GCM per i dati).
 *
 * API pubblica:
 *   - SecureWebSocketServer / SecureWebSocketClient → guidano l'handshake.
 *   - SecureSession → il canale cifrato bidirezionale dopo l'handshake.
 *   - le primitive in `crypto` → esposte per scopi didattici e per i test.
 */

export {
  SecureWebSocketServer,
  type SecureWebSocketServerEvents,
  type SecureWebSocketServerOptions,
} from "./server";

export {
  SecureWebSocketClient,
  type SecureWebSocketClientEvents,
  type SecureWebSocketClientOptions,
} from "./client";

export {
  SecureSession,
  type SecureSessionEvents,
  type SessionRole,
} from "./secure-session";

export {
  type ClientPubkeyMessage,
  type SessionKeyMessage,
  type DataMessage,
  type ProtocolMessage,
  encodeMessage,
  decodeMessage,
} from "./protocol";

// Primitive crittografiche: utili nei test e per spiegare i singoli passi.
export {
  AES_KEY_BYTES,
  NONCE_BYTES,
  AUTH_TAG_BYTES,
  RSA_MODULUS_BITS,
  type RsaKeyPair,
  generateRsaKeyPair,
  exportPublicKeyPem,
  importPublicKeyPem,
  rsaWrapKey,
  rsaUnwrapKey,
  generateAesKey,
  aesEncrypt,
  aesDecrypt,
  keyFingerprint,
  deriveDirectionalKey,
} from "./crypto";
