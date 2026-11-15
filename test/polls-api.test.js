// The polls' API (polls/api.js on polls/store.js), on a D1 stand-in
// (test/fake-d1.js) holding the real migrations, with the clock given.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePoll } from '../polls/api.js';
import { checkDefinition, tokenHash } from '../polls/rules.js';
import { closeDue, purgeFreeText } from '../polls/store.js';
import { FakeD1 } from './fake-d1.js';
import { CLOSES_MS, DAY, OPENS_MS, definition, poll, token } from './polls-fixtures.js';

const POLLS = checkDefinition(definition(poll({ freeText: { label: { en: 'Anything else?' }, maxLength: 20 } }))).polls;
const ID = 'next-feature';
const OPEN = OPENS_MS + DAY;
const URL_ = `https://sshterm.iru-yo.com/api/polls/${ID}`;

function setup() {
  const db = new FakeD1();
  const call = async (method, { now = OPEN, body, id = ID, headers = {} } = {}) => {
    const init = { method, headers: { 'content-type': 'application/json', ...headers } };
    if (body !== undefined) init.body = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
    const res = await handlePoll({ request: new Request(URL_, init), db, polls: POLLS, id, now });
    return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
  };
  return {
    db,
    get: (opts) => call('GET', opts),
    post: (body, opts) => call('POST', { ...opts, body }),
    call,
  };
}

test('an answer with a token is stored; sending again with the same token changes it and keeps one vote', async () => {
  const { db, post } = setup();
  assert.deepEqual((await post({ token: token(1), choice: 0 })).body, { ok: true, closesAt: '2026-12-15T00:00:00Z' });
  assert.equal((await post({ token: token(1), choice: 2, freeText: '  SFTP please  ' })).status, 200);
  assert.deepEqual(db.rows('votes'), [{
    poll_id: ID, token_hash: await tokenHash(ID, token(1)), choice: 2, free_text: 'SFTP please',
  }]);
  await post({ token: token(2), choice: 2 });
  assert.equal(db.rows('votes').length, 2);
});

test('the token is kept only as the hash of the poll id and the token', async () => {
  const { db, post } = setup();
  await post({ token: token(1), choice: 1 });
  const [row] = db.rows('votes');
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  assert.equal(row.token_hash, '' + await tokenHash(ID, token(1)));
  assert.notEqual(row.token_hash, await tokenHash('other-poll', token(1)));
  assert.doesNotMatch(JSON.stringify(db.rows('votes')), new RegExp(token(1)));
});

test('without a token nothing can be answered', async () => {
  const { db, post } = setup();
  for (const body of [{ choice: 0 }, { token: '', choice: 0 }, { token: 'short', choice: 0 }, { token: `${token(1)}x`, choice: 0 },
    { token: token(1).replace(/.$/, '='), choice: 0 }, { token: 1, choice: 0 }]) {
    assert.deepEqual((await post(body)).body, { error: 'token' }, JSON.stringify(body));
  }
  assert.deepEqual(db.rows('votes'), []);
});

test('the choice is one of the options', async () => {
  const { db, post } = setup();
  for (const choice of [-1, 3, 1.5, '1', null, undefined]) {
    assert.deepEqual((await post({ token: token(1), choice })).body, { error: 'choice' }, String(choice));
  }
  assert.deepEqual(db.rows('votes'), []);
});

test('free text: trimmed, at most its length, no control characters or ones that turn the direction, well-formed', async () => {
  const { db, post } = setup();
  const sent = (freeText) => post({ token: token(1), choice: 0, freeText });
  assert.equal((await sent(`  ${'😀'.repeat(20)}\n`)).status, 200);
  assert.equal(db.rows('votes')[0].free_text, '😀'.repeat(20));
  assert.equal((await sent('line one\nline two')).status, 200);
  assert.equal(db.rows('votes')[0].free_text, 'line one\nline two');
  assert.equal((await sent('   ')).status, 200);
  assert.equal(db.rows('votes')[0].free_text, null);
  for (const [text, problem] of [
    ['x'.repeat(21), 'tooLong'], ['a\u202eb', 'forbiddenCharacter'], ['a\rb', 'forbiddenCharacter'], ['a\u0000b', 'forbiddenCharacter'],
    ['a\u2067b', 'forbiddenCharacter'], ['a\tb', 'forbiddenCharacter'], ['\ud800', 'encoding'], [42, 'wrongType'],
  ]) {
    assert.deepEqual((await sent(text)).body, { error: 'freeText', problem }, JSON.stringify(text));
  }
  assert.equal(db.rows('votes')[0].free_text, null);
});

test('a body that is not UTF-8 JSON of the answer is refused', async () => {
  const { db, post, call } = setup();
  const bytes = new TextEncoder().encode(JSON.stringify({ token: token(1), choice: 0, freeText: 'ab' }));
  const broken = new Uint8Array([...bytes.slice(0, -3), 0xff, ...bytes.slice(-3)]);
  assert.deepEqual((await post(broken)).body, { error: 'encoding' });
  assert.deepEqual((await post('{')).body, { error: 'json' });
  assert.deepEqual((await post([1])).body, { error: 'json' });
  assert.deepEqual((await post({ token: token(1), choice: 0, ip: '1.2.3.4' })).body, { error: 'json' });
  assert.equal((await post('x'.repeat(16 * 1024 + 1))).status, 413);
  assert.equal((await call('POST', { body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call('PUT')).status, 405);
  assert.deepEqual(db.rows('votes'), []);
});

test('the IP address and the rest of the request are never stored', async () => {
  const { db, post } = setup();
  const headers = { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'SecretAgent/1.0', cookie: 'k=v' };
  await post({ token: token(1), choice: 1, freeText: 'hello' }, { headers });
  const all = JSON.stringify(['polls', 'votes', 'tallies', 'free_texts'].map((t) => db.rows(t)));
  assert.doesNotMatch(all, /203\.0\.113\.7|SecretAgent|k=v/);
});

test('until the deadline no count is given anywhere; after it the counts are', async () => {
  const { get, post } = setup();
  await post({ token: token(1), choice: 0 });
  await post({ token: token(2), choice: 0 });
  await post({ token: token(3), choice: 2 });
  const before = await get({ now: CLOSES_MS - 1 });
  assert.deepEqual(before.body, { id: ID, state: 'open', closesAt: '2026-12-15T00:00:00Z' });
  assert.equal(before.headers.get('cache-control'), 'no-store');
  const after = await get({ now: CLOSES_MS });
  assert.deepEqual(after.body, { id: ID, state: 'closed', closesAt: '2026-12-15T00:00:00Z', total: 3, counts: [2, 0, 1] });
});

test('after the poll is closed, reading its results writes nothing to the database', async () => {
  const lazily = setup();
  await lazily.post({ token: token(1), choice: 0 });
  await lazily.get({ now: CLOSES_MS });
  const written = lazily.db.writes;
  for (const now of [CLOSES_MS + 1, CLOSES_MS + DAY]) {
    assert.deepEqual((await lazily.get({ now })).body.counts, [1, 0, 0]);
    assert.equal((await lazily.call('HEAD', { now })).status, 200);
  }
  assert.equal(lazily.db.writes, written);

  const byCron = setup();
  await byCron.post({ token: token(1), choice: 1 });
  await closeDue(byCron.db, CLOSES_MS);
  const before = byCron.db.writes;
  assert.deepEqual((await byCron.get({ now: CLOSES_MS + 1 })).body.counts, [0, 1, 0]);
  assert.equal(byCron.db.writes, before);

  const unanswered = setup();
  assert.deepEqual((await unanswered.get({ now: CLOSES_MS })).body.counts, [0, 0, 0]);
  const once = unanswered.db.writes;
  assert.deepEqual((await unanswered.get({ now: CLOSES_MS + 1 })).body.counts, [0, 0, 0]);
  assert.equal(unanswered.db.writes, once);
});

test('a body announced as too large is refused without being read', async () => {
  const { db } = setup();
  let read = false;
  const request = {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', 'content-length': String(16 * 1024 + 1) }),
    arrayBuffer: async () => { read = true; return new ArrayBuffer(0); },
  };
  const res = await handlePoll({ request, db, polls: POLLS, id: ID, now: OPEN });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'tooLarge' });
  assert.equal(read, false);
  assert.deepEqual(db.rows('votes'), []);
});

test('after the deadline no answer is taken', async () => {
  const { db, post } = setup();
  await post({ token: token(1), choice: 0 });
  assert.deepEqual((await post({ token: token(1), choice: 1 }, { now: CLOSES_MS })).body, { error: 'closed' });
  assert.deepEqual((await post({ token: token(2), choice: 1 }, { now: CLOSES_MS })).body, { error: 'closed' });
  assert.equal(db.rows('votes')[0].choice, 0);
});

test('a poll is unknown before its start and when the definition has no such id', async () => {
  const { get, post } = setup();
  assert.equal((await get({ now: OPENS_MS - 1 })).status, 404);
  assert.equal((await post({ token: token(1), choice: 0 }, { now: OPENS_MS - 1 })).status, 404);
  assert.equal((await get({ id: 'nope' })).status, 404);
  assert.equal((await get({ now: OPENS_MS })).status, 200);
});

test('the deadline moves the counts to tallies and deletes every answer’s row; free text stays with the poll id only', async () => {
  const { db, post } = setup();
  await post({ token: token(1), choice: 0, freeText: 'first' });
  await post({ token: token(2), choice: 1, freeText: 'second' });
  await post({ token: token(3), choice: 1 });
  assert.deepEqual(await closeDue(db, CLOSES_MS - 1), []);
  assert.equal(db.rows('votes').length, 3);
  assert.deepEqual(await closeDue(db, CLOSES_MS), [ID]);
  assert.deepEqual(db.rows('votes'), []);
  assert.deepEqual(db.rows('tallies').sort((a, b) => a.choice - b.choice), [
    { poll_id: ID, choice: 0, count: 1 }, { poll_id: ID, choice: 1, count: 2 },
  ]);
  assert.deepEqual(db.rows('free_texts').map((r) => r.text).sort(), ['first', 'second']);
  assert.deepEqual(Object.keys(db.rows('free_texts')[0]).sort(), ['poll_id', 'text']);
  assert.deepEqual(db.rows('polls'), [{ id: ID, closes_at: CLOSES_MS, closed_at: CLOSES_MS }]);
  // Closing again changes nothing.
  assert.deepEqual(await closeDue(db, CLOSES_MS + DAY), []);
  const { get } = { get: (now) => handlePoll({ request: new Request(URL_), db, polls: POLLS, id: ID, now }) };
  assert.deepEqual((await (await get(CLOSES_MS + DAY)).json()).counts, [1, 2, 0]);
  assert.equal(db.rows('tallies').length, 2);
});

test('free text is deleted 90 days after the deadline', async () => {
  const { db, post } = setup();
  await post({ token: token(1), choice: 0, freeText: 'keep me for a while' });
  await closeDue(db, CLOSES_MS);
  assert.equal(await purgeFreeText(db, CLOSES_MS + 90 * DAY - 1), 0);
  assert.equal(db.rows('free_texts').length, 1);
  assert.equal(await purgeFreeText(db, CLOSES_MS + 90 * DAY), 1);
  assert.deepEqual(db.rows('free_texts'), []);
  assert.equal(db.rows('tallies').length, 1);
});

test('text that looks like SQL is kept as it was sent, and goes to the free text at the deadline', async () => {
  const { db, post, get } = setup();
  const nasty = "';DROP TABLE votes";
  await post({ token: token(1), choice: 0, freeText: nasty });
  assert.equal(db.rows('votes')[0].free_text, nasty);
  await get({ now: CLOSES_MS });
  assert.deepEqual(db.rows('free_texts').map((r) => r.text), [nasty]);
});
