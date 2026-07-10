import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
  });

  afterEach(() => {
    process.env = ORIGINAL;
  });

  it('loads database config and coerces the port from env', async () => {
    process.env.DATABASE_URL = 'mongodb://example';
    process.env.DATABASE_NAME = 'mydb';
    process.env.PORT = '1234';
    process.env.NODE_ENV = 'test';
    const { config } = await import('../src/config');
    expect(config.database).toEqual({ url: 'mongodb://example', name: 'mydb' });
    expect(config.port).toBe(1234);
    expect(config.nodeEnv).toBe('test');
  });

  it('defaults port to 8802 and nodeEnv to production', async () => {
    process.env.DATABASE_URL = 'mongodb://example';
    process.env.DATABASE_NAME = 'mydb';
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    const { config } = await import('../src/config');
    expect(config.port).toBe(8802);
    expect(config.nodeEnv).toBe('production');
  });

  it('throws a descriptive error when a required var is missing', async () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_NAME = 'mydb';
    await expect(import('../src/config')).rejects.toThrow(/DATABASE_URL/);
  });
});
