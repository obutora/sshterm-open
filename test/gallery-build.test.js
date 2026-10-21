// The gallery's build: sshterm-themes' main → public/themes/.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GalleryError, buildGallery } from '../build/gallery.js';
import { MIN_CONTRAST, contrastRatio, decodeThemeLink, validateThemeBytes } from '../public/theme-format.js';
import { STRINGS } from '../public/themes/gallery.js';
import { PRESETS, outDir, themeFile, themesRepo } from './themes-repo.js';

const cleanups = [];
after(() => cleanups.forEach((c) => c()));

const TIDE = '6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f';
const REEF = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';

/** Builds [commits] into a fresh public/ (removed after the tests); returns its reader. */
async function build(commits) {
  const repo = themesRepo(commits);
  const out = outDir();
  cleanups.push(out.cleanup);
  try {
    const count = await buildGallery({ repo: repo.dir, publicDir: out.dir, log: () => {} });
    return { count, dir: out.dir, read: (p) => readFileSync(join(out.dir, p), 'utf8'), has: (p) => existsSync(join(out.dir, p)) };
  } finally {
    repo.cleanup();
  }
}

test('a theme gets a line in the list and its own page', async () => {
  const { read } = await build([
    { date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name: 'Tide' }) } },
  ]);
  assert.match(read('themes/index.html'), new RegExp(`href="/themes/${TIDE}/"`));
  assert.match(read('themes/index.html'), />Tide</);
  assert.match(read(`themes/${TIDE}/index.html`), />Tide</);
});

/** A UUID v4 for test theme [n]. */
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test("the app's 16 presets as themes split 8 dark, 8 light", async () => {
  const files = {};
  const want = new Map();
  let n = 0;
  for (const tone of ['dark', 'light']) {
    for (const { name, colors } of Object.values(PRESETS[tone])) {
      const id = uuid(++n);
      // The tone is the 背景's; Solarized Light's 前景 (4.13:1) would fail the
      // gallery's contrast, so it gets black.
      const passing = contrastRatio(colors.foreground, colors.background) < MIN_CONTRAST
        ? { ...colors, foreground: '#000000' }
        : colors;
      files[`themes/octocat/${id}.json`] = themeFile({ id, name, colors: passing });
      want.set(id, tone);
    }
  }
  const { read } = await build([{ date: '2026-02-01T00:00:00Z', files }]);
  const got = new Map([...read('themes/index.html').matchAll(/<li data-tone="(\w+)">\s*<a href="\/themes\/([^/]+)\/">/g)]
    .map(([, tone, id]) => [id, tone]));
  assert.deepEqual(got, want);
  assert.equal([...got.values()].filter((t) => t === 'dark').length, 8);
});

test('themes are listed in the order they first came to main, a move keeping its date', async () => {
  const tide = themeFile({ id: TIDE, name: 'Tide' });
  const { read } = await build([
    { date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: tide } },
    { date: '2026-03-01T00:00:00Z', files: { [`themes/hubot/${REEF}.json`]: themeFile({ id: REEF, name: 'Reef' }) } },
    { date: '2026-04-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: null, [`themes/octo-cat/${TIDE}.json`]: tide } },
    { date: '2026-05-01T00:00:00Z', files: { [`themes/hubot/${REEF}.json`]: themeFile({ id: REEF, name: 'Reef', author: 'Hubot' }) } },
  ]);
  const order = [...read('themes/index.html').matchAll(/<h2 class="name">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(order, ['Tide', 'Reef']);
  assert.match(read(`themes/${TIDE}/index.html`), /href="https:\/\/github.com\/octo-cat"/);
  const sitemap = read('themes/sitemap.xml');
  assert.match(sitemap, new RegExp(`<loc>https://sshterm.iru-yo.com/themes/${TIDE}/</loc><lastmod>2026-04-01T00:00:00Z</lastmod>`));
  assert.match(sitemap, new RegExp(`<loc>https://sshterm.iru-yo.com/themes/${REEF}/</loc><lastmod>2026-05-01T00:00:00Z</lastmod>`));
  assert.match(sitemap, /<loc>https:\/\/sshterm.iru-yo.com\/themes\/<\/loc><lastmod>2026-05-01T00:00:00Z<\/lastmod>/);
  assert.match(sitemap, /<loc>https:\/\/sshterm.iru-yo.com\/themes\/format<\/loc>/);
});

test('the order compares instants, whatever time zone a commit was made in', async () => {
  const { read } = await build([
    { date: '2026-02-01T09:00:00+09:00', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name: 'Tide' }) } },
    { date: '2026-01-31T20:00:00-05:00', files: { [`themes/hubot/${REEF}.json`]: themeFile({ id: REEF, name: 'Reef' }) } },
  ]);
  const order = [...read('themes/index.html').matchAll(/<h2 class="name">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(order, ['Tide', 'Reef']);
  assert.match(read('themes/sitemap.xml'), /<loc>https:\/\/sshterm.iru-yo.com\/themes\/<\/loc><lastmod>2026-01-31T20:00:00-05:00<\/lastmod>/);
});

test('a merged pull request counts from its merge, not from its own commit', async () => {
  const { read } = await build([
    { date: '2026-03-01T00:00:00Z', prDate: '2026-01-10T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name: 'Tide' }) } },
    { date: '2026-02-01T00:00:00Z', files: { [`themes/hubot/${REEF}.json`]: themeFile({ id: REEF, name: 'Reef' }) } },
  ]);
  const order = [...read('themes/index.html').matchAll(/<h2 class="name">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(order, ['Reef', 'Tide']);
});

test('a theme that breaks the rules fails the build, and public/ stays as it was', async () => {
  const repo = themesRepo([
    { date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name: 'Tide' }) } },
    { date: '2026-03-01T00:00:00Z', files: { [`themes/hubot/${REEF}.json`]: themeFile({ id: REEF, name: 'Reef', license: 'GPL-3.0' }) } },
  ]);
  const out = outDir();
  try {
    writeFileSync(join(out.dir, 'themes/index.html'), 'the last build');
    await assert.rejects(
      buildGallery({ repo: repo.dir, publicDir: out.dir, log: () => {} }),
      (e) => e instanceof GalleryError
        && e.problems.length === 1
        && e.problems[0].path === `themes/hubot/${REEF}.json`
        && e.problems[0].rule === 'invalidTheme'
        && e.problems[0].reason === 'badLicense',
    );
    assert.equal(readFileSync(join(out.dir, 'themes/index.html'), 'utf8'), 'the last build');
    assert.deepEqual(readdirSync(join(out.dir, 'themes')), ['index.html']);
  } finally {
    repo.cleanup();
    out.cleanup();
  }
});

const TAGS = new Set(['html', 'head', 'meta', 'title', 'link', 'script', 'body', 'main', 'h1', 'h2', 'p', 'span', 'a',
  'div', 'ul', 'li', 'label', 'input', 'select', 'option', 'dl', 'dt', 'dd', 'figure', 'img', 'figcaption', 'section']);
const ATTRS = new Set(['lang', 'charset', 'name', 'content', 'rel', 'href', 'src', 'type', 'class', 'id', 'hidden',
  'data-t', 'data-tone', 'aria-hidden', 'value', 'autocomplete', 'spellcheck', 'width', 'height', 'alt', 'download']);

/** Every tag of [html]: [{tag, attrs: [[name, value]]}], failing on anything not markup the build writes. */
function tags(html) {
  const found = [];
  for (const [whole, closing, tag, rest] of html.matchAll(/<(\/?)([A-Za-z][\w-]*)([^>]*)>/g)) {
    assert.ok(TAGS.has(tag.toLowerCase()), `element ${whole}`);
    const attrs = [...rest.matchAll(/\s*([^\s="/]+)(?:="([^"]*)")?/g)].map(([, n, v]) => [n, v]);
    for (const [n] of attrs) assert.ok(ATTRS.has(n), `attribute ${n} in ${whole}`);
    if (!closing) found.push({ tag, attrs });
  }
  return found;
}

test('names and authors with <script> and " stay text in every page', async () => {
  const name = '<script>alert("x")</script>';
  const author = '"><img src=x onerror=alert(1)>';
  const based = { name: "</title><a href='x'>", author: 'a&b', license: 'MIT' };
  const { read } = await build([
    { date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name, author, basedOn: based }) } },
  ]);
  for (const path of ['themes/index.html', `themes/${TIDE}/index.html`]) {
    const html = read(path);
    const found = tags(html);
    const scripts = found.filter((f) => f.tag === 'script');
    assert.deepEqual(scripts.map((s) => s.attrs), [[['type', 'module'], ['src', '/themes/gallery.js']]], path);
    assert.ok(!found.some((f) => f.tag === 'img' && f.attrs.some(([n, v]) => n === 'src' && v === 'x')), path);
    assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'), path);
    assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'), path);
  }
  const page = read(`themes/${TIDE}/index.html`);
  assert.ok(page.includes('&lt;/title&gt;&lt;a href=&#x27;x&#x27;&gt; (a&amp;b · MIT)'));
  assert.match(page, /<title>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; · SSH Term<\/title>/);
});

test("a theme's page opens it as a theme link, offers its file and names who sent it", async () => {
  const { read, has, dir } = await build([
    { date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name: ' Tide ', basedOn: { name: 'Dracula' } }) } },
  ]);
  const page = read(`themes/${TIDE}/index.html`);
  const t = page.match(/<a class="button" href="\/theme#t=([A-Za-z0-9_-]+)" data-t="open">/)?.[1];
  assert.ok(t, 'the open button');
  const linked = await decodeThemeLink(t);
  assert.equal(linked.ok, true);
  assert.equal(linked.theme.id, TIDE);
  assert.equal(linked.theme.name, 'Tide');
  assert.deepEqual(linked.theme.basedOn, { name: 'Dracula' });
  assert.equal(linked.theme.colors.background, '#282A36');

  assert.match(page, new RegExp(`<a href="/themes/${TIDE}/${TIDE}.json" download data-t="download">`));
  const json = readFileSync(join(dir, `themes/${TIDE}/${TIDE}.json`));
  const checked = validateThemeBytes(new Uint8Array(json));
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.themes, [linked.theme]);
  assert.equal(JSON.parse(json).$schema, 'https://sshterm.iru-yo.com/themes/schema/v1.json');

  assert.match(page, /<a href="https:\/\/github.com\/octocat" rel="ugc">@octocat<\/a>/);
  assert.match(page, new RegExp(`<img src="/themes/${TIDE}/qr.svg"`));
  assert.match(read(`themes/${TIDE}/qr.svg`), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
  assert.match(read(`themes/${TIDE}/colors.css`), new RegExp(`^\\.t-${TIDE}\\{--t-foreground:#F8F8F2;--t-background:#282A36;`));
  assert.ok(has('themes/colors.css'));
});

function unescape(text) {
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&');
}

test('the pages as served are the English strings, and together use every one', async () => {
  const { read } = await build([
    { date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name: 'Tide', basedOn: { name: 'Dracula' } }) } },
  ]);
  const empty = await build([]);
  const used = new Set();
  for (const html of [read('themes/index.html'), read(`themes/${TIDE}/index.html`), empty.read('themes/index.html')]) {
    const found = [...html.matchAll(/<(\w+)[^>]* data-t="(\w+)"[^>]*>([^<]*)<\/\1>/g)];
    assert.equal(found.length, (html.match(/data-t=/g) ?? []).length, 'a data-t holds markup');
    for (const [, , key, text] of found) {
      assert.equal(unescape(text), STRINGS.en[key], key);
      used.add(key);
    }
  }
  for (const key of Object.keys(STRINGS.en)) {
    if (key !== 'htmlLang') assert.ok(used.has(key), `${key} is on no page`);
  }
});

test('the pages load only the site’s own files and nothing inline', async () => {
  const { read, has } = await build([
    { date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${TIDE}.json`]: themeFile({ id: TIDE, name: 'Tide' }) } },
  ]);
  const committed = (url) => existsSync(new URL(`../public${url}`, import.meta.url));
  for (const html of [read('themes/index.html'), read(`themes/${TIDE}/index.html`)]) {
    const loads = [...html.matchAll(/<(?:script|link|img)\b(?![^>]*rel="canonical")[^>]*\b(?:src|href)="([^"]*)"/g)]
      .map((m) => m[1]);
    assert.ok(loads.includes('/themes/gallery.js') && loads.includes('/themes/gallery.css'));
    for (const url of loads) {
      assert.match(url, /^\/(?!\/)/, url);
      assert.ok(committed(url) || has(url.slice(1)), `${url} is neither in public/ nor built`);
    }
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/);
    assert.doesNotMatch(html, /<style|\sstyle=|\son\w+=/);
  }
});

test('with no theme yet the list says so and has no filters', async () => {
  const { read } = await build([]);
  const html = read('themes/index.html');
  assert.match(html, /data-t="empty"/);
  assert.doesNotMatch(html, /id="filters"|id="themes"/);
  assert.match(read('themes/sitemap.xml'), /<loc>https:\/\/sshterm.iru-yo.com\/themes\/<\/loc><\/url>/);
});
