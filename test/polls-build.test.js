// The polls' build (build/polls.js, and npm run build): the definition is
// checked against its JSON Schema and the rules, and current.json, the list
// and the poll pages are written under public/polls/.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PollsError, buildPolls, fetchCounts, readDefinition } from '../build/polls.js';
import { stampSite } from '../build/stamp.js';
import { STRINGS } from '../public/polls/polls.js';
import { CLOSES_MS, DAY, OPENS_MS, definition, poll } from './polls-fixtures.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = join(ROOT, 'test/fixtures/polls');
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** The polls of the definition [doc], as the build reads them. */
const pollsIn = (doc) => readDefinition(new TextEncoder().encode(JSON.stringify(doc)));

/** Builds [doc] at [now] into a fresh public/ with polls/polls.js in it; returns its reader. */
async function build(doc, now, { getCounts = async () => { throw new Error('no API in the tests'); }, logs = [] } = {}) {
  const dir = tempDir('sshterm-polls-public-');
  mkdirSync(join(dir, 'polls'));
  writeFileSync(join(dir, 'polls/polls.js'), '// the committed script stays\n');
  await buildPolls({ polls: pollsIn(doc), publicDir: dir, now, getCounts, log: (l) => logs.push(l) });
  return {
    dir,
    list: () => readdirSync(join(dir, 'polls')).sort(),
    read: (p) => readFileSync(join(dir, p), 'utf8'),
    json: (p) => JSON.parse(readFileSync(join(dir, p), 'utf8')),
  };
}

const problemsOf = (bytes) => {
  try {
    readDefinition(bytes);
    return [];
  } catch (e) {
    if (!(e instanceof PollsError)) throw e;
    return e.problems;
  }
};

test('a definition with a link off the allowed hosts fails the rules', () => {
  const problems = problemsOf(readFileSync(join(FIXTURES, 'link-host.json')));
  assert.ok(problems.some((p) => p.rule === 'badLink' && p.path === 'polls[0].announcement.link'), JSON.stringify(problems));
});

test('a definition with a title too long fails the schema and the rules', () => {
  const problems = problemsOf(readFileSync(join(FIXTURES, 'title-too-long.json')));
  assert.ok(problems.some((p) => p.rule === 'schema' && p.path === '/polls/0/title/en' && p.keyword === 'maxLength'), JSON.stringify(problems));
  assert.ok(problems.some((p) => p.rule === 'tooLong' && p.path === 'polls[0].title.en'), JSON.stringify(problems));
});

test('the schema refuses what the rules refuse, where a schema can say it', () => {
  const bad = [
    poll({ title: { en: 'a\u202eb' } }),
    poll({ title: { en: 'a', fr: 'b' } }),
    poll({ title: { ja: 'だけ' } }),
    poll({ options: [{ en: 'one' }] }),
    poll({ options: Array.from({ length: 6 }, (_, i) => ({ en: `o${i}` })) }),
    poll({ options: [{ en: 'a'.repeat(41) }, { en: 'b' }] }),
    poll({ freeText: { label: { en: 'x' }, maxLength: 1001 } }),
    poll({ freeText: { label: { en: 'a'.repeat(81) } } }),
    poll({ id: 'Bad Id' }),
    poll({ id: 'index' }),
    poll({ opensAt: '2026-12-01' }),
    poll({ extra: true }),
    poll({ announcement: { title: { en: 'a'.repeat(41) }, body: { en: 'b' } } }),
    poll({ announcement: { title: { en: 'a' }, body: { en: 'b'.repeat(301) } } }),
    poll({ announcement: { title: { en: 'a' }, body: { en: 'b' }, link: 'http://github.com/' } }),
  ];
  for (const p of bad) {
    const problems = problemsOf(new TextEncoder().encode(JSON.stringify(definition(p))));
    assert.ok(problems.some((x) => x.rule === 'schema'), JSON.stringify(p));
    assert.ok(problems.some((x) => x.rule !== 'schema'), JSON.stringify(p));
  }
  assert.deepEqual(problemsOf(readFileSync(join(FIXTURES, 'valid.json'))), []);
  assert.deepEqual(problemsOf(readFileSync(join(ROOT, 'polls/polls.json'))), []);
  assert.deepEqual(problemsOf(Buffer.from([0xff])).map((p) => p.rule), ['notJson']);
});

test('npm run build fails on a link off the allowed hosts or a title too long, and writes nothing', () => {
  const current = join(ROOT, 'public/polls/current.json');
  const snapshot = () => [readdirSync(join(ROOT, 'public/polls')).sort(), existsSync(current) ? readFileSync(current, 'utf8') : null];
  const before = snapshot();
  for (const name of ['link-host.json', 'title-too-long.json']) {
    const run = spawnSync(process.execPath, ['build/main.js'], {
      cwd: ROOT,
      env: { ...process.env, POLLS_DEFINITION: join(FIXTURES, name), THEMES_REPO: '/nonexistent', CF_PAGES: '' },
      encoding: 'utf8',
    });
    assert.equal(run.status, 1, `${name}: ${run.stderr}`);
    assert.match(run.stderr, /polls\/polls\.json breaks its rules/);
    assert.match(run.stderr, name === 'link-host.json' ? /"rule":"badLink"/ : /"rule":"tooLong"/);
  }
  assert.deepEqual(snapshot(), before);
});

test('before a poll opens nothing of it is published', async () => {
  const site = await build(definition(poll()), OPENS_MS - 1);
  assert.deepEqual(site.list(), ['current.json', 'index.html', 'polls.js']);
  assert.deepEqual(site.json('polls/current.json').polls, []);
  assert.doesNotMatch(site.read('polls/index.html'), /next-feature/);
});

test('while open: the poll in current.json, its page saying the results come after the deadline, and no count anywhere', async () => {
  let asked = 0;
  const site = await build(definition(poll({ freeText: { label: { en: 'Anything else?' } } })), OPENS_MS + DAY, {
    getCounts: async () => { asked++; return [9, 9, 9]; },
  });
  assert.equal(asked, 0);
  assert.deepEqual(site.list(), ['current.json', 'index.html', 'next-feature.html', 'polls.js']);
  assert.equal(site.json('polls/current.json').polls[0].url, 'https://sshterm.iru-yo.com/polls/next-feature');
  const page = site.read('polls/next-feature.html');
  assert.match(page, /<h1 id="title" lang="en">What should SSH Term do next\?<\/h1>/);
  assert.match(page, new RegExp(`data-t="pending" id="pending"|id="pending"[^>]*data-t="pending"`));
  assert.match(page, new RegExp(STRINGS.en.pending.replace(/[.?]/g, '\\$&')));
  assert.match(page, new RegExp(STRINGS.en.freeNote.replace(/[.?]/g, '\\$&')));
  assert.match(page, /<textarea id="free" rows="5" maxlength="500"><\/textarea>/);
  assert.match(page, /<input type="radio" name="choice" value="2">/);
  for (const file of ['polls/current.json', 'polls/index.html', 'polls/next-feature.html']) {
    assert.doesNotMatch(site.read(file), /"counts":|"total":|\b9\b/, file);
  }
  assert.match(site.read('polls/index.html'), /<a href="\/polls\/next-feature">/);
});

test('after the deadline: the counts from the API in current.json; the page fetches them', async () => {
  const asked = [];
  const site = await build(definition(poll()), CLOSES_MS + 60_000, {
    getCounts: async (p) => { asked.push(p.id); return [4, 1, 0]; },
  });
  assert.deepEqual(asked, ['next-feature']);
  const doc = site.json('polls/current.json');
  assert.deepEqual(doc.polls, []);
  assert.equal(doc.results[0].total, 5);
  assert.deepEqual(doc.results[0].options.map((o) => o.count), [4, 1, 0]);
  assert.match(site.read('polls/index.html'), /<a href="\/polls\/next-feature">/);
});

test('when the API gives no counts the build goes on without the results, and says so', async () => {
  const logs = [];
  const site = await build(definition(poll()), CLOSES_MS + 60_000, { logs });
  assert.deepEqual(site.json('polls/current.json').results, []);
  assert.ok(logs.some((l) => /no counts for next-feature/.test(l)), logs.join('\n'));
});

test('a rebuild removes pages of polls no longer defined', async () => {
  const site = await build(definition(poll()), OPENS_MS + DAY);
  await buildPolls({ polls: pollsIn(definition()), publicDir: site.dir, now: OPENS_MS + DAY, log: () => {} });
  assert.deepEqual(site.list(), ['current.json', 'index.html', 'polls.js']);
});

test('the counts are read from GET /api/polls/<id> only when closed and as long as the options', async () => {
  const [p] = pollsIn(definition(poll()));
  const answer = (body, status = 200) => async (url) => {
    assert.equal(url, 'https://sshterm.iru-yo.com/api/polls/next-feature');
    return new Response(JSON.stringify(body), { status });
  };
  assert.deepEqual(await fetchCounts(p, answer({ state: 'closed', counts: [1, 2, 3] })), [1, 2, 3]);
  for (const [body, status] of [
    [{ state: 'open' }, 200], [{ state: 'closed', counts: [1, 2] }, 200], [{ state: 'closed', counts: [1, 2, -1] }, 200],
    [{ state: 'closed', counts: [1, 2, 3] }, 500],
  ]) await assert.rejects(fetchCounts(p, answer(body, status)), JSON.stringify(body));
});

test('the pages load only the site’s own files, run no inline script and have no inline style', async () => {
  const site = await build(definition(poll({
    freeText: { label: { en: 'Why?' } },
    announcement: { title: { en: 'Done' }, body: { en: 'Thanks.' }, link: 'https://discord.gg/abc' },
  })), CLOSES_MS + 1, { getCounts: async () => [1, 1, 1] });
  for (const file of ['polls/index.html', 'polls/next-feature.html']) {
    const page = site.read(file);
    for (const [, url] of page.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
      // The site's own files, the canonical URL and the announcement's link: nothing loads from elsewhere.
      assert.ok(url.startsWith('/') || url === 'https://discord.gg/abc' || url.startsWith('https://sshterm.iru-yo.com/polls/'), `${file}: ${url}`);
    }
    for (const [tag] of page.matchAll(/<script\b[^>]*>/g)) {
      assert.ok(/src="\/polls\/polls\.js"/.test(tag) || tag === '<script type="application/json" id="poll-data">', `${file}: ${tag}`);
    }
    assert.doesNotMatch(page, /<style|\sstyle=|\son\w+=/, file);
    assert.match(page, /<script type="module" src="\/polls\/polls\.js"><\/script>/, file);
  }
  // The announcement is on the results page, with its link.
  assert.match(site.read('polls/next-feature.html'), /<a id="announcement-link" class="go" href="https:\/\/discord\.gg\/abc" rel="noopener">/);
});

test('a text that looks like markup goes in escaped, and cannot end the data block', async () => {
  const site = await build(definition(poll({ title: { en: '</script><img src=x>' } })), OPENS_MS);
  const page = site.read('polls/next-feature.html');
  assert.doesNotMatch(page, /<img src=x>/);
  assert.match(page, /&lt;\/script&gt;&lt;img src=x&gt;/);
  assert.equal(page.match(/<\/script>/g).length, 2);
});

test('on Pages the poll pages’ links get their versions', async () => {
  const site = tempDir('sshterm-polls-stamp-');
  cpSync(join(ROOT, 'public'), site, { recursive: true });
  await buildPolls({ polls: pollsIn(definition(poll())), publicDir: site, now: OPENS_MS, getCounts: async () => [], log: () => {} });
  stampSite(site);
  const page = readFileSync(join(site, 'polls/next-feature.html'), 'utf8');
  assert.match(page, /src="\/polls\/polls\.js\?v=[0-9a-f]{12}"/);
  assert.match(page, /href="\/polls\/polls\.css\?v=[0-9a-f]{12}"/);
  assert.match(readFileSync(join(site, 'polls/polls.js'), 'utf8'), /from '\.\.\/common\.js\?v=[0-9a-f]{12}'/);
  // The repository's own public/ is untouched.
  assert.equal(execFileSync('git', ['status', '--porcelain', '--', 'public'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((l) => /polls\/.*\.html|current\.json/.test(l)).length, 0);
});
