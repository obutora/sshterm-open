// /polls/current.json, which the app reads (ADR 0024): the build makes it from
// the definition at the time it runs, with the counts of polls whose deadline
// has passed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020Module from 'ajv/dist/2020.js';
import { currentJson } from '../build/polls.js';
import { checkDefinition } from '../polls/rules.js';
import { CLOSES_MS, DAY, OPENS_MS, definition, poll } from './polls-fixtures.js';

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const schema = JSON.parse(readFileSync(new URL('../polls/schema/current.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

/** Results published at the deadline: the developer checked the counts beforehand. */
const CHECKED = { resultsAt: '2026-12-15T00:00:00Z' };
const ANNOUNCEMENT = {
  title: { en: 'SFTP is coming', ja: 'SFTP を作ります' },
  body: { en: 'Thanks for answering.' },
  link: 'https://github.com/obutora/sshterm-open',
};
const ANNOUNCED = poll({ ...CHECKED, announcement: ANNOUNCEMENT });
const polls = (...p) => checkDefinition(definition(...p)).polls;

/** current.json at [now] for [p], with [counts] by poll id; checked against its schema. */
function current(p, now, counts = {}) {
  const doc = currentJson({ polls: p, now, counts: new Map(Object.entries(counts)) });
  assert.equal(validate(doc), true, JSON.stringify(validate.errors));
  return doc;
}

test('before the start it holds nothing and says when it changes', () => {
  const doc = current(polls(ANNOUNCED), OPENS_MS - DAY);
  assert.deepEqual(doc, {
    version: 1,
    generatedAt: iso(OPENS_MS - DAY),
    nextChangeAt: iso(OPENS_MS),
    polls: [],
    results: [],
    announcements: [],
  });
});

test('while open it holds the title, the page and the deadline, and no count', () => {
  const doc = current(polls(ANNOUNCED), OPENS_MS, { 'next-feature': [5, 3, 1] });
  assert.deepEqual(doc.polls, [{
    id: 'next-feature',
    title: { en: 'What should SSH Term do next?', ja: 'SSH Term に次に足すものは？' },
    url: 'https://sshterm.iru-yo.com/polls/next-feature',
    opensAt: '2026-12-01T00:00:00Z',
    closesAt: '2026-12-15T00:00:00Z',
  }]);
  assert.deepEqual(doc.results, []);
  assert.deepEqual(doc.announcements, []);
  assert.equal(doc.nextChangeAt, '2026-12-15T00:00:00Z');
  assert.doesNotMatch(JSON.stringify(doc), /count|total/);
});

test('after the deadline it holds the results for 14 days', () => {
  const doc = current(polls(ANNOUNCED), CLOSES_MS + HOUR, { 'next-feature': [5, 3, 0] });
  assert.deepEqual(doc.polls, []);
  assert.deepEqual(doc.results, [{
    id: 'next-feature',
    title: { en: 'What should SSH Term do next?', ja: 'SSH Term に次に足すものは？' },
    url: 'https://sshterm.iru-yo.com/polls/next-feature',
    closedAt: '2026-12-15T00:00:00Z',
    until: '2026-12-29T00:00:00Z',
    total: 8,
    options: [
      { title: { en: 'Port forwarding', ja: 'ポートフォワード' }, count: 5 },
      { title: { en: 'SFTP', ja: 'SFTP' }, count: 3 },
      { title: { en: 'Themes', ja: 'テーマ' }, count: 0 },
    ],
  }]);
  assert.equal(doc.nextChangeAt, '2026-12-29T00:00:00Z');
  assert.deepEqual(current(polls(ANNOUNCED), CLOSES_MS + 14 * DAY, { 'next-feature': [5, 3, 0] }).results, []);
});

test('without the counts (the API did not answer) the results wait, and it asks to be made again within an hour', () => {
  const now = CLOSES_MS + HOUR;
  const doc = current(polls(ANNOUNCED), now);
  assert.deepEqual(doc.results, []);
  assert.equal(doc.nextChangeAt, iso(now + HOUR));
});

test('the announcement shows from the results (the deadline) for 30 days, with its link', () => {
  assert.deepEqual(current(polls(ANNOUNCED), CLOSES_MS - 1).announcements, []);
  const doc = current(polls(ANNOUNCED), CLOSES_MS, { 'next-feature': [1, 0, 0] });
  assert.deepEqual(doc.announcements, [{
    pollId: 'next-feature',
    title: { en: 'SFTP is coming', ja: 'SFTP を作ります' },
    body: { en: 'Thanks for answering.' },
    link: 'https://github.com/obutora/sshterm-open',
    url: 'https://sshterm.iru-yo.com/polls/next-feature',
    from: '2026-12-15T00:00:00Z',
    until: '2027-01-14T00:00:00Z',
  }]);
  assert.equal(doc.nextChangeAt, '2026-12-29T00:00:00Z');
  const lastResults = current(polls(ANNOUNCED), Date.parse('2026-12-29T00:00:00Z'));
  assert.deepEqual(lastResults.announcements.map((a) => a.pollId), ['next-feature']);
  assert.equal(lastResults.nextChangeAt, '2027-01-14T00:00:00Z');
  const late = current(polls(ANNOUNCED), Date.parse('2027-01-14T00:00:00Z'));
  assert.deepEqual(late.announcements, []);
  assert.equal(late.nextChangeAt, null);
  const unlinked = poll({ ...CHECKED, announcement: { title: { en: 't' }, body: { en: 'b' } } });
  assert.equal(current(polls(unlinked), CLOSES_MS, { 'next-feature': [0, 0, 0] }).announcements[0].link, null);
});

test('without resultsAt, after the deadline: no results and no announcement, even with the counts at hand', () => {
  const unchecked = poll({ announcement: ANNOUNCEMENT });
  for (const now of [CLOSES_MS, CLOSES_MS + HOUR, CLOSES_MS + 20 * DAY]) {
    const doc = current(polls(unchecked), now, { 'next-feature': [5, 3, 0] });
    assert.deepEqual([doc.polls, doc.results, doc.announcements], [[], [], []], iso(now));
    // Nothing is due to change until the definition says when the results are published.
    assert.equal(doc.nextChangeAt, null, iso(now));
    assert.doesNotMatch(JSON.stringify(doc), /count|total/);
  }
});

test('with resultsAt after the deadline: results for 14 days and the announcement for 30, both from resultsAt', () => {
  const RESULTS_MS = CLOSES_MS + 3 * DAY;
  const later = polls(poll({ resultsAt: iso(RESULTS_MS), announcement: ANNOUNCEMENT }));
  const counts = { 'next-feature': [5, 3, 0] };
  const waiting = current(later, CLOSES_MS, counts);
  assert.deepEqual([waiting.results, waiting.announcements], [[], []]);
  assert.equal(waiting.nextChangeAt, '2026-12-18T00:00:00Z');
  const doc = current(later, RESULTS_MS, counts);
  assert.deepEqual(doc.results.map(({ closedAt, until, total }) => ({ closedAt, until, total })), [{
    closedAt: '2026-12-15T00:00:00Z', until: '2027-01-01T00:00:00Z', total: 8,
  }]);
  assert.deepEqual(doc.announcements.map(({ from, until }) => ({ from, until })), [{
    from: '2026-12-18T00:00:00Z', until: '2027-01-17T00:00:00Z',
  }]);
  assert.equal(doc.nextChangeAt, '2027-01-01T00:00:00Z');
  assert.deepEqual(current(later, Date.parse('2027-01-01T00:00:00Z'), counts).results, []);
  assert.deepEqual(current(later, Date.parse('2027-01-17T00:00:00Z'), counts).announcements, []);
  // The first build after resultsAt is merged reads the counts from the Function deployed before it, which
  // gives none: the results wait for the next build, within the hour.
  const first = current(later, RESULTS_MS + 60_000);
  assert.deepEqual(first.results, []);
  assert.equal(first.nextChangeAt, iso(RESULTS_MS + 60_000 + HOUR));
});

test('a poll after another: the open one, the last one’s results, newest first', () => {
  const second = poll({ id: 'second', opensAt: '2026-12-20T00:00:00Z', closesAt: '2026-12-22T00:00:00Z', resultsAt: '2026-12-22T00:00:00Z' });
  const doc = current(polls(poll(CHECKED), second), Date.parse('2026-12-21T00:00:00Z'), { 'next-feature': [1, 1, 1] });
  assert.deepEqual(doc.polls.map((p) => p.id), ['second']);
  assert.deepEqual(doc.results.map((p) => p.id), ['next-feature']);
  const later = current(polls(poll(CHECKED), second), Date.parse('2026-12-23T00:00:00Z'), { 'next-feature': [1, 1, 1], second: [0, 2, 0] });
  assert.deepEqual(later.results.map((p) => p.id), ['second', 'next-feature']);
});

test('the schema refuses a link that is not https, an overlong title and counts on an open poll', () => {
  const doc = current(polls(ANNOUNCED), CLOSES_MS, { 'next-feature': [1, 0, 0] });
  const broken = (change) => {
    const copy = structuredClone(doc);
    change(copy);
    return validate(copy);
  };
  assert.equal(broken((d) => { d.announcements[0].link = 'http://github.com/'; }), false);
  assert.equal(broken((d) => { d.results[0].title.en = 'a'.repeat(61); }), false);
  assert.equal(broken((d) => { d.results[0].title.en = 'a\u202eb'; }), false);
  assert.equal(broken((d) => { d.polls.push({ ...d.results[0], opensAt: d.results[0].closedAt, closesAt: d.results[0].until }); }), false);
});
