// The HTTP wrapper: refuses requests before spending tokens unless the caller is signed in and allow-listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.ALLOWED_EMAILS = 'me@example.com';
const { default: handler } = await import('../api/chat.js');

function call(req) {
  return new Promise((resolve) => {
    const res = { code: 0, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
    handler({ method: 'POST', headers: {}, body: {}, ...req }, res);
  });
}

test('rejects GET', async () => assert.equal((await call({ method: 'GET' })).code, 405));
test('rejects missing token', async () => assert.equal((await call({})).code, 401));
test('rejects a bad token (Supabase unreachable → treated as signed out)', async () => {
  const r = await call({ headers: { authorization: 'Bearer nope' }, body: { messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(r.code, 401);
});
