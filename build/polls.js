// The polls' build (アンケート, ADR 0024): checks polls/polls.json against its
// JSON Schema and polls/rules.js, then writes under public/polls/:
//
//   current.json   what the app reads: the open poll, recent results and
//                  announcements, as of the time the build runs
//   <id>.html      each poll that has opened: answered with #k=<token> until
//                  its deadline, its results after
//   index.html     the open poll and the past results
//
// The counts of a poll whose deadline has passed come from the site's own API
// (GET /api/polls/<id>, which closes the poll if the cron Worker has not yet).
// A definition that breaks a rule fails the build and writes nothing; the
// Cloudflare Pages build is the deploy gate.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import { Html, html } from './gallery.js';
import { DAY, RESULTS_DAYS, SITE, checkDefinition, pollUrl } from '../polls/rules.js';
import { STRINGS } from '../public/polls/polls.js';

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
export const DEFINITION = new URL('../polls/polls.json', import.meta.url);
const readSchema = (name) => JSON.parse(readFileSync(new URL(`../polls/schema/${name}`, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
const validateDefinition = ajv.compile(readSchema('definition.schema.json'));
const validateCurrent = ajv.compile(readSchema('current.schema.json'));

const HOUR = 60 * 60 * 1000;
const EN = STRINGS.en;

export class PollsError extends Error {
  constructor(problems) {
    super(`polls/polls.json breaks its rules:\n${problems.map((p) => JSON.stringify(p)).join('\n')}`);
    this.problems = problems;
  }
}

/**
 * Checks the definition file's bytes: UTF-8 JSON, its JSON Schema, then the
 * rules. Returns the polls (polls/rules.js's) or throws a PollsError holding
 * every problem found.
 */
export function readDefinition(bytes) {
  let doc;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (e) {
    throw new PollsError([{ path: '', rule: 'notJson', message: e.message }]);
  }
  const problems = [];
  if (!validateDefinition(doc)) {
    for (const e of validateDefinition.errors) {
      problems.push({ path: e.instancePath, rule: 'schema', keyword: e.keyword, message: e.message });
    }
  }
  const checked = checkDefinition(doc);
  if (!checked.ok) problems.push(...checked.problems);
  if (problems.length) throw new PollsError(problems);
  return checked.polls;
}

// ── current.json ────────────────────────────────────────────────────────────

/** [ms] as current.json writes times: UTC, to the second. */
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + 'Z';
const resultsUntil = (poll) => poll.closesAt + RESULTS_DAYS * DAY;
const isOpen = (poll, now) => poll.opensAt <= now && now < poll.closesAt;
const showsResults = (poll, now) => poll.closesAt <= now && now < resultsUntil(poll);
const announces = (poll, now) => poll.announcement && poll.announcement.from <= now && now < poll.announcement.until;
const newestFirst = (a, b) => b.closesAt - a.closesAt;

/**
 * current.json at [now] for [polls], [counts] holding the counts (by option)
 * of polls whose deadline has passed, by id. A poll in its 14 days of results
 * without counts is left out, and nextChangeAt asks for another build within
 * the hour.
 */
export function currentJson({ polls, now, counts }) {
  const results = polls.filter((p) => showsResults(p, now)).sort(newestFirst);
  const missing = results.some((p) => !counts.has(p.id));
  const times = polls.flatMap((p) => [p.opensAt, p.closesAt, resultsUntil(p), p.announcement?.from, p.announcement?.until]);
  if (missing) times.push(now + HOUR);
  const next = Math.min(...times.filter((t) => t !== undefined && t > now));
  return {
    version: 1,
    generatedAt: iso(now),
    nextChangeAt: Number.isFinite(next) ? iso(next) : null,
    polls: polls.filter((p) => isOpen(p, now)).map((p) => ({
      id: p.id, title: p.title, url: pollUrl(p.id), opensAt: iso(p.opensAt), closesAt: iso(p.closesAt),
    })),
    results: results.filter((p) => counts.has(p.id)).map((p) => {
      const n = counts.get(p.id);
      return {
        id: p.id,
        title: p.title,
        url: pollUrl(p.id),
        closedAt: iso(p.closesAt),
        until: iso(resultsUntil(p)),
        total: n.reduce((a, b) => a + b, 0),
        options: p.options.map((title, i) => ({ title, count: n[i] })),
      };
    }),
    announcements: polls.filter((p) => announces(p, now)).sort(newestFirst).map((p) => ({
      pollId: p.id,
      title: p.announcement.title,
      body: p.announcement.body,
      link: p.announcement.link,
      url: pollUrl(p.id),
      from: iso(p.announcement.from),
      until: iso(p.announcement.until),
    })),
  };
}

// ── The pages ───────────────────────────────────────────────────────────────

/** An element of the page's English frame text that polls.js puts in Japanese. */
const t = (tag, key, attrs = '') => html`<${new Html(tag)}${new Html(attrs)} data-t="${key}">${EN[key]}</${new Html(tag)}>`;
/** A text of the poll in English, which polls.js puts in the reader's language. */
const own = (tag, texts, attrs = '') => html`<${new Html(tag)}${new Html(attrs)} lang="en">${texts.en}</${new Html(tag)}>`;
/** [ms] as the pages show it before polls.js puts it in the reader's time zone. */
const shown = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const time = (ms, attrs = '') => html`<time${new Html(attrs)} datetime="${iso(ms)}">${shown(ms)}</time>`;
/** Data for polls.js, in a block the browser never runs; `<` escaped so it cannot end the block. */
const data = (value) => new Html(`<script type="application/json" id="poll-data">${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>`);

function shell({ title, titleKey, description, page, canonical, body }) {
  const titleTag = titleKey ? html`<title data-t="${titleKey}">${title}</title>` : html`<title>${title}</title>`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${titleTag}
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/icon.png">
<link rel="stylesheet" href="/sheet.css">
<link rel="stylesheet" href="/legal.css">
<link rel="stylesheet" href="/polls/polls.css">
<script type="module" src="/polls/polls.js"></script>
</head>
<body data-page="${page}">
<div class="sheet">
<div class="bar">
  <a class="mark" href="/polls/"><span class="glyph" aria-hidden="true">&gt;_</span>SSH Term</a>
  ${t('span', 'polls')}
</div>
${body}
<div class="foot">
  <a class="go" href="/polls/" data-t="list">${EN.list}</a>
  <a href="/terms" data-t="terms">${EN.terms}</a>
  <a href="/privacy" data-t="privacy">${EN.privacy}</a>
  <span class="coord">sshterm.iru-yo.com/polls</span>
</div>
</div>
</body>
</html>
`.text;
}

function announcementSection(a) {
  return html`<section id="announcement" class="announcement" hidden>
  ${t('h2', 'announcement')}
  ${own('h3', a.title, ' id="announcement-title"')}
  ${own('p', a.body, ' id="announcement-body"')}
  ${a.link ? html`<p><a id="announcement-link" class="go" href="${a.link}" rel="noopener">${a.link}</a></p>` : ''}
</section>`;
}

function pollPage(poll, now) {
  const free = poll.freeText;
  return shell({
    title: `${poll.title.en} · SSH Term`,
    description: EN.description,
    page: 'poll',
    canonical: pollUrl(poll.id),
    body: html`<div class="hero">
  ${t('p', 'poll', ' class="label"')}
  ${own('h1', poll.title, ' id="title"')}
  <p class="dates">${t('span', 'deadline')} ${time(poll.closesAt, ' id="closes"')}</p>
</div>
<main>
<section id="answer" hidden>
  <form id="form">
    <fieldset>
      ${t('legend', 'choose')}
${poll.options.map((option, i) => html`      <label class="choice"><input type="radio" name="choice" value="${i}"> ${own('span', option, ` data-option="${i}"`)}</label>\n`)}    </fieldset>
${free ? html`    <label class="free" for="free">${own('span', free.label, ' id="free-label"')}</label>
    ${t('p', 'freeNote', ' class="note"')}
    <textarea id="free" rows="5" maxlength="${free.maxLength}"></textarea>
` : ''}    <button id="send" class="button" type="submit" data-t="send">${EN.send}</button>
  </form>
</section>
<p id="status" class="status" aria-live="polite"></p>
${t('p', 'pending', ' id="pending" class="note" hidden')}
<section id="results" hidden>
  ${t('h2', 'results')}
  <ol id="counts" class="counts"></ol>
  <p id="total"></p>
</section>
${poll.announcement && poll.announcement.from <= now ? announcementSection(poll.announcement) : ''}
<noscript><p>${EN.noscript}</p></noscript>
</main>
${data({
  id: poll.id,
  title: poll.title,
  options: poll.options,
  freeText: free ? { label: free.label, maxLength: free.maxLength } : null,
  closesAt: iso(poll.closesAt),
  announcement: poll.announcement && poll.announcement.from <= now
    ? { title: poll.announcement.title, body: poll.announcement.body }
    : null,
})}`,
  });
}

function listItem(poll) {
  return html`  <li><a href="/polls/${poll.id}">${own('span', poll.title, ` data-poll="${poll.id}"`)}</a> ${time(poll.closesAt, ' class="dates"')}</li>\n`;
}

function listPage(polls, now) {
  const open = polls.filter((p) => isOpen(p, now));
  const closed = polls.filter((p) => p.closesAt <= now).sort(newestFirst);
  return shell({
    title: EN.listTitle,
    titleKey: 'listTitle',
    description: EN.description,
    page: 'list',
    canonical: `${SITE}/polls/`,
    body: html`<div class="hero">
  ${t('h1', 'listTitle')}
  ${t('p', 'listLede', ' class="lede"')}
</div>
<main>
<section>
  ${t('h2', 'openNow')}
  ${open.length ? html`<ul class="polls">\n${open.map(listItem)}</ul>` : t('p', 'noneOpen', ' class="note"')}
</section>
<section>
  ${t('h2', 'pastResults')}
  ${closed.length ? html`<ul class="polls">\n${closed.map(listItem)}</ul>` : t('p', 'noResults', ' class="note"')}
</section>
</main>
${data({ titles: Object.fromEntries([...open, ...closed].map((p) => [p.id, p.title])) })}`,
  });
}

/**
 * The files the polls add to public/, by path under it: current.json, the
 * list and a page for each poll that has opened by [now].
 */
export function pollFiles({ polls, now, counts }) {
  const doc = currentJson({ polls, now, counts });
  if (!validateCurrent(doc)) throw new Error(`current.json breaks its schema: ${JSON.stringify(validateCurrent.errors)}`);
  const files = new Map([['polls/current.json', `${JSON.stringify(doc, null, 2)}\n`]]);
  const opened = polls.filter((p) => p.opensAt <= now);
  files.set('polls/index.html', listPage(opened, now));
  for (const poll of opened) files.set(`polls/${poll.id}.html`, pollPage(poll, now));
  return files;
}

/** The counts (by option) of a closed poll from the site's API; throws when it has none. */
export async function fetchCounts(poll, fetchImpl = fetch) {
  const res = await fetchImpl(`${SITE}/api/polls/${poll.id}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET /api/polls/${poll.id}: ${res.status}`);
  const body = await res.json();
  const ok = body?.state === 'closed' && Array.isArray(body.counts) && body.counts.length === poll.options.length &&
    body.counts.every((n) => Number.isInteger(n) && n >= 0);
  if (!ok) throw new Error(`GET /api/polls/${poll.id}: no counts`);
  return body.counts;
}

/** Removes what an earlier build wrote under [publicDir]/polls. */
function removeBuilt(publicDir) {
  const dir = join(publicDir, 'polls');
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.html') || name === 'current.json') rmSync(join(dir, name), { force: true });
  }
}

/**
 * Builds the polls from [definition] (a path or file URL) into [publicDir] as
 * of [now]. Every file is made before any is written. A poll whose results
 * are due but whose counts cannot be fetched is left out of current.json
 * (logged), and the cron Worker asks for another build within the hour.
 */
export async function buildPolls({ definition = DEFINITION, publicDir, now = Date.now(), getCounts = fetchCounts, log = console.log }) {
  const polls = readDefinition(readFileSync(definition));
  const counts = new Map();
  for (const poll of polls.filter((p) => showsResults(p, now))) {
    try {
      counts.set(poll.id, await getCounts(poll));
    } catch (e) {
      log(`The polls: no counts for ${poll.id} yet (${e.message}); current.json leaves its results out.`);
    }
  }
  const files = pollFiles({ polls, now, counts });
  removeBuilt(publicDir);
  for (const [path, content] of files) {
    mkdirSync(join(publicDir, 'polls'), { recursive: true });
    writeFileSync(join(publicDir, path), content);
  }
  log(`The polls: ${polls.length} poll(s), ${files.size - 2} page(s).`);
  return polls.length;
}
