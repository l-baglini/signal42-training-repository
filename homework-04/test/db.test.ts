import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const connect = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const db = vi.fn((name: string) => ({ name }));
  const MongoClient = vi.fn(() => ({ connect, close, db }));
  return { connect, close, db, MongoClient };
});

vi.mock('mongodb', () => ({ MongoClient: hoisted.MongoClient }));

describe('db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connect opens a client and returns the configured database', async () => {
    const { connect, close } = await import('../src/db');
    const database = await connect();
    expect(hoisted.MongoClient).toHaveBeenCalledWith('mongodb://localhost:27017/');
    expect(hoisted.connect).toHaveBeenCalledOnce();
    expect(hoisted.db).toHaveBeenCalledWith('test-sellers');
    expect(database).toEqual({ name: 'test-sellers' });
    await close();
  });

  it('close closes the active client', async () => {
    const { connect, close } = await import('../src/db');
    await connect();
    await close();
    expect(hoisted.close).toHaveBeenCalledOnce();
  });

  it('close is a no-op when no client is open', async () => {
    const { close } = await import('../src/db');
    await expect(close()).resolves.toBeUndefined();
  });
});
