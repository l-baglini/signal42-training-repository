/**
 * server.ts — lato server dell'handshake.
 *
 * Avvolge un `WebSocketServer` della libreria `ws`. Per ogni connessione esegue
 * il lato server dell'handshake ibrido e poi emette una `SecureSession` pronta
 * all'uso. Da quel momento il server non sa più nulla di RSA: cifra e decifra
 * solo in AES con la chiave di sessione.
 *
 * Handshake, lato server:
 *   1. (il client apre la connessione)
 *   2. riceve `client-pubkey` con la pubblica RSA del client
 *   3. genera una chiave AES-256 casuale, la cifra con quella pubblica (RSA-OAEP)
 *      e la rimanda come `session-key`
 *   → solo il client può decifrarla con la sua privata.
 */

import { type RawData, type ServerOptions, type WebSocket, WebSocketServer } from "ws";

import { generateAesKey, importPublicKeyPem, rsaWrapKey } from "./crypto";
import { decodeMessage, encodeMessage } from "./protocol";
import { SecureSession } from "./secure-session";
import { TypedEmitter } from "./typed-emitter";

export interface SecureWebSocketServerEvents extends Record<string, unknown[]> {
  /** Handshake completato: ecco un canale cifrato pronto. */
  connection: [session: SecureSession];
  /** Il server è in ascolto. */
  listening: [];
  /** Errore a livello di server. */
  error: [err: Error];
  /** Una singola connessione ha fallito l'handshake (la connessione viene chiusa). */
  "handshake-error": [err: Error];
  /** Il server è stato chiuso. */
  close: [];
}

export type SecureWebSocketServerOptions = ServerOptions;

export class SecureWebSocketServer extends TypedEmitter<SecureWebSocketServerEvents> {
  private readonly wss: WebSocketServer;

  constructor(options: SecureWebSocketServerOptions) {
    super();
    this.wss = new WebSocketServer(options);

    this.wss.on("listening", () => this.emit("listening"));
    this.wss.on("error", (err) => this.emit("error", err));
    this.wss.on("close", () => this.emit("close"));
    this.wss.on("connection", (socket: WebSocket) => this.runHandshake(socket));
  }

  /** Indirizzo su cui il server è in ascolto (utile per stampare la porta). */
  address() {
    return this.wss.address();
  }

  /** Chiude il server e tutte le connessioni. */
  close(callback?: () => void): void {
    this.wss.close(callback);
  }

  private runHandshake(socket: WebSocket): void {
    // Primo (e unico) messaggio di handshake atteso dal server: la pubblica RSA.
    socket.once("message", (raw: RawData) => {
      try {
        const message = decodeMessage(raw.toString());
        if (message.type !== "client-pubkey") {
          throw new Error(`atteso 'client-pubkey', ricevuto '${message.type}'`);
        }

        const clientPublicKey = importPublicKeyPem(message.key);

        // Chiave di sessione: casuale, una per connessione.
        const sessionKey = generateAesKey();

        // La consegniamo cifrata con la pubblica del client: solo lui la legge.
        const wrapped = rsaWrapKey(clientPublicKey, sessionKey);
        socket.send(
          encodeMessage({ type: "session-key", key: wrapped.toString("base64") }),
        );

        // Da qui in poi: canale AES bidirezionale.
        const session = new SecureSession(socket, sessionKey, "server");
        this.emit("connection", session);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit("handshake-error", error);
        socket.close();
      }
    });
  }
}
