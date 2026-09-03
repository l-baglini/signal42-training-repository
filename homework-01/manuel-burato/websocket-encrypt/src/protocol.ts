/**
 * protocol.ts — il "contratto sul filo".
 *
 * Tre tipi di messaggio, tutti JSON. I primi due sono l'handshake (in chiaro:
 * contengono solo chiavi pubbliche e la chiave AES GIÀ cifrata). Il terzo
 * trasporta i dati applicativi, sempre cifrati.
 */

/** Passo 2 dell'handshake: il client manda la sua chiave pubblica RSA (PEM). */
export interface ClientPubkeyMessage {
  type: "client-pubkey";
  key: string; // chiave pubblica RSA in PEM
}

/**
 * Passo 3 dell'handshake: il server manda la chiave AES di sessione, cifrata
 * con la pubblica del client (RSA-OAEP). In base64.
 */
export interface SessionKeyMessage {
  type: "session-key";
  key: string; // base64( RSA-OAEP( chiave AES ) )
}

/**
 * Messaggio dati (bidirezionale). `payload` è base64 di:
 *
 *      nonce[12] ++ ciphertext[...] ++ tag[16]
 */
export interface DataMessage {
  type: "data";
  payload: string;
}

export type ProtocolMessage =
  | ClientPubkeyMessage
  | SessionKeyMessage
  | DataMessage;

/** Serializza un messaggio per spedirlo sulla WebSocket. */
export function encodeMessage(message: ProtocolMessage): string {
  return JSON.stringify(message);
}

/**
 * Interpreta i byte ricevuti dalla WebSocket come un {@link ProtocolMessage}.
 * Fa una validazione minima ma sufficiente per il POC: meglio fallire forte e
 * subito che propagare un messaggio malformato.
 */
export function decodeMessage(raw: string): ProtocolMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("messaggio non è JSON valido");
  }

  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    throw new Error("messaggio senza campo 'type'");
  }

  const message = parsed as { type: unknown };
  switch (message.type) {
    case "client-pubkey":
    case "session-key":
      if (typeof (parsed as { key?: unknown }).key !== "string") {
        throw new Error(`messaggio '${message.type}' senza campo 'key' valido`);
      }
      return parsed as ClientPubkeyMessage | SessionKeyMessage;
    case "data":
      if (typeof (parsed as { payload?: unknown }).payload !== "string") {
        throw new Error("messaggio 'data' senza campo 'payload' valido");
      }
      return parsed as DataMessage;
    default:
      throw new Error(`tipo di messaggio sconosciuto: ${String(message.type)}`);
  }
}
