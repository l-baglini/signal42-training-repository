/**
 * secure-session.ts — il canale cifrato DOPO l'handshake.
 *
 * Una `SecureSession` possiede:
 *   - una WebSocket grezza (`ws`) ormai stabilita,
 *   - la chiave AES-256 condivisa concordata nell'handshake.
 *
 * È identica per client e server: una volta che entrambi hanno la stessa chiave,
 * la cifratura è perfettamente simmetrica e bidirezionale.
 *
 * Eventi emessi:
 *   - "message"  (plaintext: string)        → testo decifrato e autenticato
 *   - "wire-out" (payloadBase64: string)     → blob cifrato che ESCE (per la demo)
 *   - "wire-in"  (payloadBase64: string)     → blob cifrato che ENTRA (per la demo)
 *   - "error"    (err: Error)                → es. tag GCM non valido (manomissione)
 *   - "close"
 */

import type { RawData, WebSocket } from "ws";

import { aesDecrypt, aesEncrypt, keyFingerprint } from "./crypto";
import { decodeMessage, encodeMessage } from "./protocol";
import { TypedEmitter } from "./typed-emitter";

export type SessionRole = "client" | "server";

export interface SecureSessionEvents extends Record<string, unknown[]> {
  message: [plaintext: string];
  "wire-out": [payloadBase64: string];
  "wire-in": [payloadBase64: string];
  error: [err: Error];
  close: [];
}

export class SecureSession extends TypedEmitter<SecureSessionEvents> {
  constructor(
    private readonly socket: WebSocket,
    private readonly key: Buffer,
    readonly role: SessionRole,
  ) {
    super();
    this.socket.on("message", (raw: RawData) => this.handleRaw(raw));
    this.socket.on("close", () => this.emit("close"));
    this.socket.on("error", (err: Error) => this.emit("error", err));
  }

  /**
   * Impronta della chiave di sessione. Utile in demo per verificare a occhio che
   * client e server abbiano concordato ESATTAMENTE la stessa chiave AES.
   */
  get keyFingerprint(): string {
    return keyFingerprint(this.key);
  }

  /** Cifra `text` con AES-256-GCM e lo invia come messaggio `data`. */
  send(text: string): void {
    const blob = aesEncrypt(this.key, Buffer.from(text, "utf8"));
    const payload = blob.toString("base64");

    // Esponiamo il ciphertext "sul filo" prima di spedirlo (serve alla demo).
    this.emit("wire-out", payload);
    this.socket.send(encodeMessage({ type: "data", payload }));
  }

  /** Chiude la connessione sottostante. */
  close(): void {
    this.socket.close();
  }

  private handleRaw(raw: RawData): void {
    let message;
    try {
      message = decodeMessage(raw.toString());
    } catch (err) {
      this.emit("error", toError(err));
      return;
    }

    if (message.type !== "data") {
      // Dopo l'handshake ci aspettiamo solo messaggi 'data'.
      this.emit("error", new Error(`atteso messaggio 'data', ricevuto '${message.type}'`));
      return;
    }

    // Mostriamo il blob cifrato così com'è arrivato, prima di decifrarlo.
    this.emit("wire-in", message.payload);

    try {
      const blob = Buffer.from(message.payload, "base64");
      const plaintext = aesDecrypt(this.key, blob);
      this.emit("message", plaintext.toString("utf8"));
    } catch (err) {
      // Qui finisce un messaggio MANOMESSO: GCM rileva il tag non valido e
      // .final() lancia. È esattamente la garanzia di integrità che vogliamo.
      this.emit("error", toError(err));
    }
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
