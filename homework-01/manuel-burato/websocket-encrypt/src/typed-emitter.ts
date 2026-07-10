/**
 * typed-emitter.ts — un sottile wrapper tipizzato attorno a EventEmitter di Node.
 * Serve solo a dare autocompletamento e type-safety agli eventi (message, error, …)
 * senza tirare dentro dipendenze. Niente di crittografico qui.
 */

import { EventEmitter } from "node:events";

// Mappa "nome evento" -> "tuple degli argomenti passati ai listener".
export type EventMap = Record<string, unknown[]>;

export class TypedEmitter<T extends EventMap> extends EventEmitter {
  override on<K extends keyof T & string>(
    event: K,
    listener: (...args: T[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof T & string>(
    event: K,
    listener: (...args: T[K]) => void,
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof T & string>(
    event: K,
    listener: (...args: T[K]) => void,
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof T & string>(event: K, ...args: T[K]): boolean {
    return super.emit(event, ...args);
  }
}
