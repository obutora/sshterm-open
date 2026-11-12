// The purchase-complete page (/desktop/purchased, /ja/desktop/purchased):
// it hands Stripe's Checkout Session id to the license Worker and shows the key.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { run, sessionIdFrom, STRINGS } from '../public/purchased.js';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const KEY =
  'sshterm1_AQBpVbkAVKV_fDQFbrzt8iSVJa0VumCFkZidiNtVd8dHqxI6rcThAi3GlUP1qxL_BxOWpPlD4pAnCOt9uidVSLRGqhyFIJY3EANDxNcP';
const LINK = `sshterm-desktop://license/${KEY}`;
const SID = 'cs_test_a1b2c3d4e5f6';

/** The elements of the page by id, as the script uses them. */
function fakePage(lang, search, answer) {
  const el = () => ({ hidden: false, textContent: '', href: '', value: '', listeners: {},
    addEventListener(t, fn) { this.listeners[t] = fn; } });
  const ids = { status: el(), result: el(), key: el(), open: el(), copy: el() };
  ids.result.hidden = true;
  const calls = [];
  const env = {
    document: { documentElement: { lang }, getElementById: (id) => ids[id] ?? null },
    location: { search },
    fetch: async (url, init) => {
      calls.push([url, init.method, JSON.parse(init.body)]);
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    },
    copied: [],
  };
  env.navigator = { clipboard: { writeText: async (t) => env.copied.push(t) } };
  return { env, ids, calls };
}

test('the Checkout Session id comes from ?session_id= only', () => {
  assert.equal(sessionIdFrom(`?session_id=${SID}`), SID);
  assert.equal(sessionIdFrom(`?x=1&session_id=${SID}`), SID);
  for (const search of ['', '?', '?session_id=', '?session_id=pi_1', `?session_id=${SID}&session_id=${SID}`, '?session_id=cs_test_%2F..']) {
    assert.equal(sessionIdFrom(search), null, search);
  }
});

test('a paid session shows the key and the Open in the app link', async () => {
  const { env, ids, calls } = fakePage('en', `?session_id=${SID}`, { status: 200, body: { key: KEY, link: LINK } });
  await run(env);
  assert.deepEqual(calls, [['/api/license', 'POST', { session_id: SID, lang: 'en' }]]);
  assert.equal(ids.result.hidden, false);
  assert.equal(ids.key.value, KEY);
  assert.equal(ids.open.href, LINK);
  assert.equal(ids.status.textContent, STRINGS.en.done);
});

test('the Japanese page asks for the Japanese email', async () => {
  const { env, ids, calls } = fakePage('ja', `?session_id=${SID}`, { status: 200, body: { key: KEY, link: LINK } });
  await run(env);
  assert.equal(calls[0][2].lang, 'ja');
  assert.equal(ids.status.textContent, STRINGS.ja.done);
});

test('only an sshterm-desktop link is ever put on the button', async () => {
  const { env, ids } = fakePage('en', `?session_id=${SID}`, { status: 200, body: { key: KEY, link: 'javascript:alert(1)' } });
  await run(env);
  assert.equal(ids.result.hidden, true);
  assert.equal(ids.status.textContent, STRINGS.en.failed);
});

test('the copy button copies the key', async () => {
  const { env, ids } = fakePage('en', `?session_id=${SID}`, { status: 200, body: { key: KEY, link: LINK } });
  await run(env);
  await ids.copy.listeners.click();
  assert.deepEqual(env.copied, [KEY]);
  assert.equal(ids.copy.textContent, STRINGS.en.copied);
});

test('an unpaid session, a missing id and a failure each say so, and show no key', async () => {
  for (const [search, answer, want] of [
    [`?session_id=${SID}`, { status: 402, body: { error: 'not_paid' } }, 'notPaid'],
    ['', { status: 200, body: {} }, 'noSession'],
    [`?session_id=${SID}`, { status: 500, body: {} }, 'failed'],
    [`?session_id=${SID}`, new Error('offline'), 'failed'],
  ]) {
    for (const lang of ['en', 'ja']) {
      const { env, ids, calls } = fakePage(lang, search, answer);
      await run(env);
      assert.equal(ids.result.hidden, true, want);
      assert.equal(ids.status.textContent, STRINGS[lang][want], want);
      if (want === 'noSession') assert.equal(calls.length, 0);
    }
  }
});

test('both languages have every string', () => {
  assert.deepEqual(Object.keys(STRINGS.ja).sort(), Object.keys(STRINGS.en).sort());
});

test('the pages load only their own files, and the status is announced', () => {
  for (const path of ['desktop/purchased.html', 'ja/desktop/purchased.html']) {
    const html = read(path);
    assert.match(html, /<script type="module" src="\/purchased.js"><\/script>/, path);
    for (const id of ['status', 'result', 'key', 'open', 'copy']) assert.match(html, new RegExp(`id="${id}"`), `${path} #${id}`);
    assert.match(html, /id="status"[^>]*aria-live="polite"/, path);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)|<style|\sstyle=|\son\w+=/, path);
  }
  assert.match(read('desktop/purchased.html'), /<html lang="en">/);
  assert.match(read('ja/desktop/purchased.html'), /<html lang="ja">/);
});

test('only the purchase-complete pages may call the Worker', () => {
  const headers = read('_headers');
  for (const path of ['/desktop/purchased', '/ja/desktop/purchased']) {
    const block = headers.split(/\n(?=\S)/).find((b) => b.startsWith(`${path}\n`));
    assert.ok(block, path);
    assert.match(block, /! Content-Security-Policy/);
    assert.match(block, /Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self';/);
  }
  assert.doesNotMatch(headers.split('\n\n')[0], /connect-src/);
});
