// The gallery's own JS (public/themes/gallery.js) and the headers its pages
// are served with.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nameKey } from '../public/theme-format.js';
import { STRINGS, shows } from '../public/themes/gallery.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every language has every string', () => {
  const keys = Object.keys(STRINGS.en).sort();
  for (const lang of ['en', 'ja', 'ko', 'zh', 'zh_Hant']) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), keys, lang);
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.ok(typeof value === 'string' && value.trim() !== '', `${lang}.${key}`);
    }
  }
});

test('the name filter finds a part of the name, ignoring case and width', () => {
  const tide = { name: 'Tokyo Tide', tone: 'dark' };
  for (const query of ['', '  ', 'tide', 'TIDE', 'ｔｉｄｅ', 'kyo t', ' Tokyo ']) {
    assert.equal(shows(tide, { query, tone: '' }), true, JSON.stringify(query));
  }
  for (const query of ['tides', 'reef', 'tokyotide']) {
    assert.equal(shows(tide, { query, tone: '' }), false, query);
  }
  assert.equal(nameKey('Straße'), nameKey('STRASSE'));
});

test('the background filter shows only its tone; no tone shows both', () => {
  const dark = { name: 'Tide', tone: 'dark' };
  const light = { name: 'Tide Light', tone: 'light' };
  assert.deepEqual([dark, light].map((t) => shows(t, { query: '', tone: '' })), [true, true]);
  assert.deepEqual([dark, light].map((t) => shows(t, { query: '', tone: 'dark' })), [true, false]);
  assert.deepEqual([dark, light].map((t) => shows(t, { query: 'tide', tone: 'light' })), [false, true]);
  assert.deepEqual([dark, light].map((t) => shows(t, { query: 'reef', tone: 'light' })), [false, false]);
});

/**
 * The headers Cloudflare Pages sends for [path] by public/_headers: the
 * blocks whose URL pattern matches, in the file's order; `! Name` removes
 * what earlier blocks set, a name set again is joined with a comma.
 */
function headersFor(path) {
  const headers = new Map();
  const blocks = read('public/_headers').split(/\n(?=\S)/).map((b) => b.split('\n'));
  for (const [pattern, ...lines] of blocks) {
    if (pattern.startsWith('#')) continue;
    const source = pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    if (!new RegExp(`^${source}$`).test(path)) continue;
    for (const line of lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
      if (line.startsWith('! ')) {
        headers.delete(line.slice(2).toLowerCase());
        continue;
      }
      const [name, value] = [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()];
      headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
    }
  }
  return headers;
}

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const ID = '6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f';

test('_headers: the gallery is not noindex; /theme, /open and the rest are', () => {
  for (const path of ['/themes', '/themes/', `/themes/${ID}/`, `/themes/${ID}/qr.svg`, '/themes/format', '/themes/sitemap.xml']) {
    const h = headersFor(path);
    assert.equal(h.has('x-robots-tag'), false, path);
    assert.equal(h.get('content-security-policy'), CSP, path);
    assert.equal(h.get('referrer-policy'), 'no-referrer', path);
  }
  for (const path of ['/theme', '/theme.html', '/open', '/open.html', '/app', '/', '/404.html', '/theme-format.js']) {
    const h = headersFor(path);
    assert.equal(h.get('x-robots-tag'), 'noindex', path);
    assert.equal(h.get('content-security-policy'), CSP, path);
  }
});

test('robots.txt points to the gallery’s sitemap', () => {
  assert.match(read('public/robots.txt'), /^Sitemap: https:\/\/sshterm\.iru-yo\.com\/themes\/sitemap\.xml$/m);
  assert.doesNotMatch(read('public/robots.txt'), /^Disallow: \/\S/m);
});
