/**
 * Test d'integrazione: handshake reale su una WebSocket (porta effimera),
 * verifica che i due lati concordino la stessa chiave e che i messaggi
 * viaggino cifrati in ENTRAMBE le direzioni.
 */

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import {
  type SecureSession,
  SecureWebSocketClient,
  SecureWebSocketServer,
} from "websocket-encrypt";

test("handshake end-to-end: stessa chiave AES e traffico bidirezionale cifrato", async () => {
  const server = new SecureWebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;

  // La sessione lato server arriva quando l'handshake è completo.
  const serverSessionPromise = new Promise<SecureSession>((resolve) =>
    server.once("connection", (session) => resolve(session)),
  );

  const client = new SecureWebSocketClient(`ws://localhost:${port}`);
  const clientSession = await new Promise<SecureSession>((resolve) =>
    client.once("secure", (session) => resolve(session)),
  );
  const serverSession = await serverSessionPromise;

  // 1) Entrambi i lati hanno concordato ESATTAMENTE la stessa chiave.
  assert.equal(clientSession.keyFingerprint, serverSession.keyFingerprint);

  // 2) client → server: il server deve ricevere il plaintext corretto.
  const onServer = new Promise<string>((resolve) => serverSession.once("message", resolve));
  clientSession.send("ping dal client");
  assert.equal(await onServer, "ping dal client");

  // 3) server → client: e viceversa (bidirezionale).
  const onClient = new Promise<string>((resolve) => clientSession.once("message", resolve));
  serverSession.send("pong dal server");
  assert.equal(await onClient, "pong dal server");

  // Pulizia.
  clientSession.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("handshake: messaggi multipli in sequenza nelle due direzioni", async () => {
  const server = new SecureWebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;

  // Il server fa l'eco maiuscolo di ogni messaggio.
  server.on("connection", (session) => {
    session.on("message", (text) => session.send(text.toUpperCase()));
  });

  const client = new SecureWebSocketClient(`ws://localhost:${port}`);
  const session = await new Promise<SecureSession>((resolve) =>
    client.once("secure", (s) => resolve(s)),
  );

  const replies: string[] = [];
  const done = new Promise<void>((resolve) => {
    session.on("message", (text) => {
      replies.push(text);
      if (replies.length === 3) resolve();
    });
  });

  session.send("uno");
  session.send("due");
  session.send("tre");
  await done;

  assert.deepEqual(replies, ["UNO", "DUE", "TRE"]);

  session.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
