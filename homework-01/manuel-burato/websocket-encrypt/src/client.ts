/**
 * client.ts — lato client dell'handshake.
 *
 * Avvolge una `WebSocket` della libreria `ws`. Appena la connessione si apre,
 * esegue il lato client dell'handshake ibrido e poi emette una `SecureSession`.
 *
 * Handshake, lato client:
 *   1. apre la WebSocket verso il server
 *   2. genera una coppia di chiavi RSA e invia la PUBBLICA come `client-pubkey`
 *   3. riceve `session-key` (la chiave AES cifrata con la sua pubblica)
 *   4. la decifra con la sua PRIVATA → ora condivide la chiave AES col server.
 */

import { type ClientOptions, type RawData, WebSocket } from "ws";

import {
  exportPublicKeyPem,
  generateRsaKeyPair,
  rsaUnwrapKey,
  type RsaKeyPair,
} from "./crypto";
import { decodeMessage, encodeMessage } from "./protocol";
import { SecureSession } from "./secure-session";
import { TypedEmitter } from "./typed-emitter";

export interface SecureWebSocketClientEvents extends Record<string, unknown[]> {
  /** La WebSocket grezza si è aperta (prima dell'handshake). */
  open: [];
  /** Handshake completato: ecco il canale cifrato pronto. */
  secure: [session: SecureSession];
  /** Errore prima/durante l'handshake (connessione, parsing, decifratura chiave). */
  error: [err: Error];
  /** La connessione si è chiusa. */
  close: [];
}

export interface SecureWebSocketClientOptions {
  /** Dimensione della chiave RSA generata dal client. Default: 2048. */
  rsaBits?: number;
  /** Opzioni passate pari pari alla WebSocket sottostante (`ws`). */
  ws?: ClientOptions;
}

export class SecureWebSocketClient extends TypedEmitter<SecureWebSocketClientEvents> {
  private readonly socket: WebSocket;
  private readonly keyPair: RsaKeyPair;

  constructor(address: string, options: SecureWebSocketClientOptions = {}) {
    super();

    // La coppia RSA è effimera: vive quanto la connessione.
    this.keyPair = generateRsaKeyPair(options.rsaBits);
    this.socket = new WebSocket(address, options.ws);

    this.socket.on("open", () => this.onOpen());
    this.socket.once("message", (raw: RawData) => this.onSessionKey(raw));
    this.socket.on("error", (err) => this.emit("error", err));
    this.socket.on("close", () => this.emit("close"));
  }

  private onOpen(): void {
    this.emit("open");

    // Passo 2: spediamo la nostra chiave pubblica RSA in chiaro (PEM).
    const pem = exportPublicKeyPem(this.keyPair.publicKey);
    this.socket.send(encodeMessage({ type: "client-pubkey", key: pem }));
  }

  private onSessionKey(raw: RawData): void {
    try {
      const message = decodeMessage(raw.toString());
      if (message.type !== "session-key") {
        throw new Error(`atteso 'session-key', ricevuto '${message.type}'`);
      }

      // Passo 4: solo la nostra privata può sciogliere il wrap RSA-OAEP.
      const wrapped = Buffer.from(message.key, "base64");
      const sessionKey = rsaUnwrapKey(this.keyPair.privateKey, wrapped);

      // Stessa chiave AES del server: canale bidirezionale pronto.
      const session = new SecureSession(this.socket, sessionKey, "client");
      this.emit("secure", session);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      this.socket.close();
    }
  }
}
