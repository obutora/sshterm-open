// The polls' pages as a browser runs them (public/polls/polls.js on the pages
// build/polls.js writes), on a small stand-in for the DOM, with the clock
// and fetch given.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPolls, readDefinition } from '../build/polls.js';
import { STRINGS, runList, runPoll, tokenFrom } from '../public/polls/polls.js';
import { CLOSES_MS, DAY, OPENS_MS, definition, poll, token } from './polls-fixtures.js';
import { headersFor } from './headers.js';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const POLL = poll({
  title: { en: 'What should SSH Term do next?', ja: 'SSH Term に次に足すものは？', ko: '다음은?' },
  freeText: { label: { en: 'Anything else?', ja: 'ほかにあれば' } },
  announcement: { title: { en: 'SFTP is coming', ja: 'SFTP を作ります' }, body: { en: 'Thanks.' } },
});

/** The page [file] that the build writes at [now]. */
async function built(file, now) {
  const dir = mkdtempSync(join(tmpdir(), 'sshterm-polls-page-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'polls'));
  const polls = readDefinition(new TextEncoder().encode(JSON.stringify(definition(POLL))));
  await buildPolls({ polls, publicDir: dir, now, getCounts: async () => [1, 2, 3], log: () => {} });
  return readFileSync(join(dir, 'polls', file), 'utf8');
}

class El {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.id = attrs.id ?? '';
    this.hidden = 'hidden' in attrs;
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
      .map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v]));
    this.textContent = '';
    this.lang = attrs.lang ?? '';
    this.value = attrs.value ?? '';
    this.dateTime = attrs.datetime ?? '';
    this.checked = false;
    this.disabled = false;
    this.children = [];
    this.listeners = {};
  }

  set innerHTML(_) {
    throw new Error('innerHTML used');
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
}

/** A browser of [language] showing [html] at [hash], fetch answering by [answer](url, init). */
function browser(html, { hash = '', language = 'en', answer = () => { throw new Error('no fetch expected'); } } = {}) {
  const all = [];
  for (const [, tag, rest] of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const attrs = {};
    for (const [, k, v] of rest.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) attrs[k] = v ?? '';
    if (attrs.id || attrs['data-t'] || attrs['data-option'] || attrs['data-poll'] || tag === 'time' || attrs.name === 'choice') {
      all.push(new El(tag, attrs));
    }
  }
  const byId = new Map(all.filter((e) => e.id).map((e) => [e.id, e]));
  byId.get('poll-data').textContent = html.match(/<script type="application\/json" id="poll-data">(.*?)<\/script>/s)[1];
  const radios = all.filter((e) => e.attrs.name === 'choice');
  const form = byId.get('form');
  if (form) form.querySelector = (s) => (s === 'input[name="choice"]:checked' ? radios.find((r) => r.checked) ?? null : null);
  const calls = [];
  const document = {
    title: '',
    documentElement: { lang: 'en' },
    getElementById: (id) => byId.get(id) ?? null,
    querySelector(selector) {
      const m = selector.match(/^\[data-option="(\d+)"\]$/);
      if (!m) throw new Error(selector);
      return all.find((e) => e.dataset.option === m[1]) ?? null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-t]') return all.filter((e) => e.dataset.t);
      if (selector === '[data-poll]') return all.filter((e) => e.dataset.poll);
      if (selector === 'time') return all.filter((e) => e.tagName === 'TIME');
      throw new Error(selector);
    },
    createElement: (tag) => new El(tag),
  };
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    const r = await answer(url, init);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
  return {
    env: { document, location: { hash }, navigator: { language }, fetch },
    document,
    calls,
    $: (id) => byId.get(id),
    radios,
    submit: () => form.listeners.submit({ preventDefault() {} }),
  };
}

const OPEN = OPENS_MS + DAY;
const TOKEN = token(7);

test('the token is #k=<43 base64url characters>, once; other keys are dropped', () => {
  assert.equal(tokenFrom(`#k=${TOKEN}`), TOKEN);
  assert.equal(tokenFrom(`#x=1&k=${TOKEN}`), TOKEN);
  for (const hash of ['', '#', '#k=', `#k=${TOKEN}&k=${TOKEN}`, `#k=${TOKEN}x`, '#k=abc', `#t=${TOKEN}`, `#k=${TOKEN.slice(0, 42)}+`]) {
    assert.equal(tokenFrom(hash), null, hash);
  }
});

test('with a token, before the deadline: the form, the note on free text, no count and no request', async () => {
  const page = browser(await built('next-feature.html', OPEN), { hash: `#k=${TOKEN}` });
  await runPoll({ ...page.env, now: () => OPEN });
  assert.equal(page.$('answer').hidden, false);
  assert.equal(page.$('pending').hidden, false);
  assert.equal(page.$('pending').textContent, STRINGS.en.pending);
  assert.equal(page.$('results').hidden, true);
  assert.deepEqual(page.calls, []);
  assert.equal(page.$('announcement'), undefined, 'the announcement comes with the build after the deadline');
});

test('sending posts the token, the choice and the free text; sending again changes the answer', async () => {
  const page = browser(await built('next-feature.html', OPEN), {
    hash: `#x=1&k=${TOKEN}`,
    answer: () => ({ status: 200, body: { ok: true } }),
  });
  await runPoll({ ...page.env, now: () => OPEN });
  page.radios[2].checked = true;
  page.$('free').value = 'More themes';
  await page.submit();
  assert.deepEqual(page.calls, [{ url: '/api/polls/next-feature', method: 'POST', body: { token: TOKEN, choice: 2, freeText: 'More themes' } }]);
  assert.equal(page.$('status').textContent, STRINGS.en.sent);
  assert.equal(page.$('send').textContent, STRINGS.en.sendAgain);
  page.radios[2].checked = false;
  page.radios[0].checked = true;
  await page.submit();
  assert.deepEqual(page.calls[1].body, { token: TOKEN, choice: 0, freeText: 'More themes' });
});

test('nothing is sent until an answer is chosen', async () => {
  const page = browser(await built('next-feature.html', OPEN), { hash: `#k=${TOKEN}` });
  await runPoll({ ...page.env, now: () => OPEN });
  await page.submit();
  assert.equal(page.$('status').textContent, STRINGS.en.chooseOne);
  assert.deepEqual(page.calls, []);
});

test('without a token (or with a broken one) the page only shows: no form', async () => {
  for (const hash of ['', '#k=abc', `#k=${TOKEN}&k=${TOKEN}`]) {
    const page = browser(await built('next-feature.html', OPEN), { hash });
    await runPoll({ ...page.env, now: () => OPEN });
    assert.equal(page.$('answer').hidden, true, hash);
    assert.equal(page.$('status').textContent, STRINGS.en.noToken, hash);
    assert.equal(page.$('pending').hidden, false, hash);
    assert.deepEqual(page.calls, [], hash);
  }
});

test('each failure says so', async () => {
  for (const [answer, want] of [
    [{ status: 429 }, 'tooMany'],
    [{ status: 400, body: { error: 'freeText', problem: 'tooLong' } }, 'freeTextBad'],
    [{ status: 400, body: { error: 'token' } }, 'failed'],
    [{ status: 500 }, 'failed'],
    [new Error('offline'), 'failed'],
  ]) {
    const page = browser(await built('next-feature.html', OPEN), { hash: `#k=${TOKEN}`, answer: () => answer });
    await runPoll({ ...page.env, now: () => OPEN });
    page.radios[1].checked = true;
    await page.submit();
    assert.equal(page.$('status').textContent, STRINGS.en[want], want);
    assert.equal(page.$('send').disabled, false);
  }
});

test('a send the deadline overtook shows the results', async () => {
  const page = browser(await built('next-feature.html', OPEN), {
    hash: `#k=${TOKEN}`,
    answer: (url, init) => (init.method === 'POST' ? { status: 409, body: { error: 'closed' } } : { body: { state: 'closed', counts: [1, 0, 0] } }),
  });
  await runPoll({ ...page.env, now: () => OPEN });
  page.radios[0].checked = true;
  await page.submit();
  assert.equal(page.$('results').hidden, false);
  assert.equal(page.$('answer').hidden, true);
});

test('after the deadline: the counts from the API, the total, the announcement; no form even with a token', async () => {
  const page = browser(await built('next-feature.html', CLOSES_MS), {
    hash: `#k=${TOKEN}`,
    answer: () => ({ body: { id: 'next-feature', state: 'closed', total: 6, counts: [1, 2, 3] } }),
  });
  await runPoll({ ...page.env, now: () => CLOSES_MS });
  assert.deepEqual(page.calls, [{ url: '/api/polls/next-feature', method: 'GET', body: undefined }]);
  assert.equal(page.$('answer').hidden, true);
  assert.equal(page.$('pending').hidden, true);
  assert.equal(page.$('results').hidden, false);
  const rows = page.$('counts').children.map((li) => li.children.map((c) => (c.tagName === 'METER' ? `${c.value}/${c.max}` : c.textContent)));
  assert.deepEqual(rows, [
    ['Port forwarding', '1 (17%)', '1/6'],
    ['SFTP', '2 (33%)', '2/6'],
    ['Themes', '3 (50%)', '3/6'],
  ]);
  assert.equal(page.$('total').textContent, 'Answers: 6');
  assert.equal(page.$('announcement').hidden, false);
  assert.equal(page.$('announcement-title').textContent, 'SFTP is coming');
});

test('the results page stops showing the announcement at its end, 30 days after the deadline', async () => {
  const answer = () => ({ body: { id: 'next-feature', state: 'closed', total: 6, counts: [1, 2, 3] } });
  const lastDay = browser(await built('next-feature.html', CLOSES_MS + 30 * DAY - 1), { answer });
  await runPoll({ ...lastDay.env, now: () => CLOSES_MS + 30 * DAY - 1 });
  assert.equal(lastDay.$('announcement').hidden, false);
  const ended = browser(await built('next-feature.html', CLOSES_MS + 30 * DAY), { answer });
  await runPoll({ ...ended.env, now: () => CLOSES_MS + 30 * DAY });
  assert.equal(ended.$('results').hidden, false);
  assert.equal(ended.$('announcement'), undefined);
});

test('after the deadline, results that do not come say so', async () => {
  for (const answer of [new Error('offline'), { status: 500 }, { body: { state: 'open' } }, { body: { state: 'closed', counts: [1] } }]) {
    const page = browser(await built('next-feature.html', CLOSES_MS), { answer: () => answer });
    await runPoll({ ...page.env, now: () => CLOSES_MS });
    assert.equal(page.$('results').hidden, true);
    assert.equal(page.$('status').textContent, STRINGS.en.resultsFailed);
  }
});

test('a page built while open turns to the results once its deadline passes', async () => {
  const page = browser(await built('next-feature.html', OPEN), { answer: () => ({ body: { state: 'closed', counts: [0, 0, 0] } }) });
  await runPoll({ ...page.env, now: () => CLOSES_MS + 1 });
  assert.equal(page.$('results').hidden, false);
  assert.equal(page.$('total').textContent, 'Answers: 0');
});

test('the frame is Japanese for Japanese and English otherwise; the poll’s texts in the reader’s language, English standing in', async () => {
  const ja = browser(await built('next-feature.html', OPEN), { hash: `#k=${TOKEN}`, language: 'ja-JP' });
  await runPoll({ ...ja.env, now: () => OPEN });
  assert.equal(ja.document.documentElement.lang, 'ja');
  assert.equal(ja.$('pending').textContent, '締め切りのあと、ここで公開します。');
  assert.equal(ja.document.querySelectorAll('[data-t]').find((e) => e.dataset.t === 'freeNote').textContent,
    '開発者だけが読みます。名前・ホスト名・IP アドレスなどは書かないでください。');
  assert.equal(ja.$('title').textContent, 'SSH Term に次に足すものは？');
  assert.equal(ja.$('free-label').textContent, 'ほかにあれば');
  assert.equal(ja.document.querySelector('[data-option="1"]').textContent, 'SFTP');
  assert.equal(ja.document.title, 'SSH Term に次に足すものは？ · SSH Term');

  const ko = browser(await built('next-feature.html', OPEN), { language: 'ko-KR' });
  await runPoll({ ...ko.env, now: () => OPEN });
  assert.equal(ko.document.documentElement.lang, 'en');
  assert.equal(ko.$('title').textContent, '다음은?');
  assert.equal(ko.$('title').lang, 'ko');
  assert.equal(ko.document.querySelector('[data-option="0"]').textContent, 'Port forwarding');
  assert.equal(ko.document.querySelector('[data-option="0"]').lang, 'en');
});

test('the list puts the titles in the reader’s language', async () => {
  const page = browser(await built('index.html', CLOSES_MS), { language: 'ja' });
  runList(page.env);
  const title = page.document.querySelectorAll('[data-poll]')[0];
  assert.equal(title.textContent, 'SSH Term に次に足すものは？');
  assert.equal(page.document.querySelectorAll('[data-t]').find((e) => e.dataset.t === 'pastResults').textContent, '結果');
});

test('both languages have every string', () => {
  assert.deepEqual(Object.keys(STRINGS.ja).sort(), Object.keys(STRINGS.en).sort());
  for (const lang of ['en', 'ja']) {
    for (const [k, v] of Object.entries(STRINGS[lang])) assert.ok(typeof v === 'string' && v.trim(), `${lang}.${k}`);
  }
});

test('_headers: the poll pages may connect to their own origin only; the rest of the site still may not', () => {
  const POLL_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  for (const path of ['/polls', '/polls/', '/polls/next-feature', '/polls/current.json']) {
    const h = headersFor(path);
    assert.equal(h.get('content-security-policy'), POLL_CSP, path);
    assert.equal(h.get('x-robots-tag'), 'noindex', path);
    assert.equal(h.get('referrer-policy'), 'no-referrer', path);
  }
  for (const path of ['/open', '/theme', '/themes/', '/app']) {
    assert.doesNotMatch(headersFor(path).get('content-security-policy'), /connect-src|https:/, path);
  }
});
