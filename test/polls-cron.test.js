// The cron Worker (workers/polls-cron/) closes polls and deletes free text on
// its own clock, with no visitor, and asks Pages for a build when
// current.json is due to change. Also: the Pages Function on its binding.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePoll, pagesFunction } from '../polls/api.js';
import { checkDefinition, isoTime } from '../polls/rules.js';
import cron, { runCron } from '../workers/polls-cron/index.js';
import { FakeD1 } from './fake-d1.js';
import { CLOSES_MS, DAY, OPENS_MS, definition, poll, token } from './polls-fixtures.js';

const POLLS = checkDefinition(definition(poll({ freeText: { label: { en: 'Why?' } } }))).polls;
const SITE = 'https://sshterm.iru-yo.com';
const HOOK = 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/abc';

async function answered(db, tok, choice, freeText) {
  const request = new Request(`${SITE}/api/polls/next-feature`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: tok, choice, freeText }),
  });
  const res = await handlePoll({ request, db, polls: POLLS, id: 'next-feature', now: OPENS_MS + DAY });
  assert.equal(res.status, 200);
}

/** A fetch that serves current.json with [nextChangeAt] and records every call. */
function fakeFetch(nextChangeAt, { hookStatus = 200, currentStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push([String(url), init.method ?? 'GET']);
    if (url === `${SITE}/polls/current.json`) {
      return new Response(JSON.stringify({ version: 1, nextChangeAt }), { status: currentStatus });
    }
    if (url === HOOK) return new Response('{}', { status: hookStatus });
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetch, calls };
}

test('with no visitor, the hourly run closes the poll at its deadline and deletes the answers’ rows', async () => {
  const db = new FakeD1();
  await answered(db, token(1), 0, 'one');
  await answered(db, token(2), 1);
  const { fetch } = fakeFetch(null);
  assert.deepEqual(await runCron({ db, now: CLOSES_MS - 1, fetch, site: SITE }), { closed: [], purged: 0, rebuilt: false });
  assert.equal(db.rows('votes').length, 2);
  assert.deepEqual(await runCron({ db, now: CLOSES_MS + 1, fetch, site: SITE }), { closed: ['next-feature'], purged: 0, rebuilt: false });
  assert.deepEqual(db.rows('votes'), []);
  assert.equal(db.rows('tallies').length, 2);
  assert.deepEqual(db.rows('free_texts').map((r) => r.text), ['one']);
});

test('with no visitor, the free text goes 90 days after the deadline', async () => {
  const db = new FakeD1();
  await answered(db, token(1), 0, 'one');
  const { fetch } = fakeFetch(null);
  await runCron({ db, now: CLOSES_MS, fetch, site: SITE });
  assert.equal((await runCron({ db, now: CLOSES_MS + 90 * DAY - 1, fetch, site: SITE })).purged, 0);
  assert.equal((await runCron({ db, now: CLOSES_MS + 90 * DAY, fetch, site: SITE })).purged, 1);
  assert.deepEqual(db.rows('free_texts'), []);
});

test('it calls the deploy hook only once current.json’s nextChangeAt has passed', async () => {
  const db = new FakeD1();
  const now = Date.parse('2026-12-15T00:30:00Z');
  const due = fakeFetch('2026-12-15T00:00:00Z');
  assert.equal((await runCron({ db, now, fetch: due.fetch, site: SITE, deployHook: HOOK })).rebuilt, true);
  assert.deepEqual(due.calls, [[`${SITE}/polls/current.json`, 'GET'], [HOOK, 'POST']]);
  for (const next of ['2026-12-15T01:00:00Z', null]) {
    const later = fakeFetch(next);
    assert.equal((await runCron({ db, now, fetch: later.fetch, site: SITE, deployHook: HOOK })).rebuilt, false);
    assert.deepEqual(later.calls, [[`${SITE}/polls/current.json`, 'GET']]);
  }
  const missing = fakeFetch('2026-12-15T00:00:00Z', { currentStatus: 404 });
  assert.equal((await runCron({ db, now, fetch: missing.fetch, site: SITE, deployHook: HOOK })).rebuilt, false);
  const noHook = fakeFetch('2026-12-15T00:00:00Z');
  assert.equal((await runCron({ db, now, fetch: noHook.fetch, site: SITE })).rebuilt, false);
  assert.deepEqual(noHook.calls, []);
  await assert.rejects(runCron({ db, now, fetch: fakeFetch('2026-12-15T00:00:00Z', { hookStatus: 500 }).fetch, site: SITE, deployHook: HOOK }));
});

test('the scheduled handler runs on the binding and the time of the trigger', async () => {
  const db = new FakeD1();
  await answered(db, token(1), 2);
  const waits = [];
  await cron.scheduled({ scheduledTime: CLOSES_MS }, { POLLS_DB: db, SITE }, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(db.rows('tallies'), [{ poll_id: 'next-feature', choice: 2, count: 1 }]);
});

test('the Pages Function answers on the POLLS_DB binding at the time of the request', async () => {
  const db = new FakeD1();
  const now = Date.now();
  const [open] = checkDefinition(definition(poll({ opensAt: isoTime(now - DAY), closesAt: isoTime(now + DAY) }))).polls;
  const onRequest = pagesFunction([open]);
  const request = (init) => new Request(`${SITE}/api/polls/next-feature`, init);
  const res = await onRequest({
    request: request({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token(1), choice: 1 }) }),
    env: { POLLS_DB: db },
    params: { id: 'next-feature' },
  });
  assert.equal(res.status, 200);
  assert.equal(db.rows('votes').length, 1);
  const unknown = await onRequest({ request: request(), env: { POLLS_DB: db }, params: { id: 'other' } });
  assert.equal(unknown.status, 404);
});
