import { describe, it, expect, vi } from 'vitest';
import type { AnySchema } from 'ajv';
import { validate } from '../src/server/validate';

const schema: AnySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['domain'],
  properties: { domain: { type: 'string' } },
};

function invoke(body: unknown) {
  const handler = validate(schema);
  const req = { body } as any;
  const state: { status?: number; sent?: unknown } = {};
  const res = {
    status(code: number) {
      state.status = code;
      return this;
    },
    send(payload: unknown) {
      state.sent = payload;
      return this;
    },
  } as any;
  const next = vi.fn();
  handler(req, res, next);
  return { next, state };
}

describe('validate middleware', () => {
  it('calls next() for a valid body', () => {
    const { next, state } = invoke({ domain: 'example.com' });
    expect(next).toHaveBeenCalledOnce();
    expect(state.status).toBeUndefined();
  });

  it('responds 400 for an invalid body without calling next()', () => {
    const { next, state } = invoke({});
    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(400);
    expect(state.sent).toBeDefined();
  });

  it('rejects additional properties', () => {
    const { next, state } = invoke({ domain: 'x.com', extra: true });
    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(400);
  });
});
