// The format page (/themes/format), its example file and the headers the
// schema is served with.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020Module from 'ajv/dist/2020.js';
import { STRINGS } from '../public/themes/format.js';

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const html = read('themes/format.html');
const example = read('themes/example.json');

function unescape(text) {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&');
}

/** The text of the element with [id] (a <pre><code>). */
function preText(id) {
  const m = html.match(new RegExp(`<pre id="${id}"><code>([^<]*)</code></pre>`));
  assert.ok(m, id);
  return unescape(m[1]);
}

test('every language has every string', () => {
  const keys = Object.keys(STRINGS.en).sort();
  for (const lang of ['en', 'ja', 'ko', 'zh', 'zh_Hant']) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), keys, lang);
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.ok(typeof value === 'string' && value.trim() !== '', `${lang}.${key}`);
    }
  }
});

test('the page as served is the English strings, every one of them', () => {
  const found = [...html.matchAll(/<(\w+)[^>]* data-t="(\w+)"[^>]*>([^<]*)<\/\1>/g)];
  assert.equal(found.length, (html.match(/data-t=/g) ?? []).length, 'a data-t holds markup');
  for (const [, , key, text] of found) {
    assert.equal(unescape(text), STRINGS.en[key], key);
  }
  const used = new Set(found.map((m) => m[2]));
  for (const key of Object.keys(STRINGS.en)) {
    if (key !== 'htmlLang') assert.ok(used.has(key), `${key} is not on the page`);
  }
});

test('the page loads only its own files and nothing inline', () => {
  const loads = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]*)"/g)];
  assert.ok(loads.length > 0);
  for (const [, url] of loads) assert.match(url, /^\/(?!\/)/, url);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/);
  assert.doesNotMatch(html, /<style|\sstyle=|\son\w+=/);
});

test('the example on the page is the example file, and it is valid', () => {
  assert.equal(preText('example'), example);
  const validate = new Ajv2020().compile(JSON.parse(read('themes/schema/v1.json')));
  const doc = JSON.parse(example);
  assert.equal(validate(doc), true, JSON.stringify(validate.errors));
  // What the schema cannot say.
  assert.ok(new TextEncoder().encode(example).length <= 64 * 1024);
  const ids = doc.themes.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of doc.themes) assert.equal(t.name, t.name.trim());
});

test('the JavaScript for a theme link makes a link that inflates to the theme', async () => {
  const themeLink = (0, eval)(`(${preText('link-js')})`);
  const theme = JSON.parse(example).themes[0];
  const link = await themeLink(theme);
  const prefix = 'https://sshterm.iru-yo.com/theme#t=';
  assert.ok(link.startsWith(prefix), link);
  const t = link.slice(prefix.length);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  const bytes = Buffer.from(t, 'base64url');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const doc = JSON.parse(await new Response(stream).text());
  assert.deepEqual(doc, { format: 'ssh-term-theme', formatVersion: 1, themes: [theme] });
});

test('the schema is served as application/schema+json to any origin', () => {
  const blocks = read('_headers').split(/\n(?=\S)/);
  const block = blocks.find((b) => b.startsWith('/themes/schema/*\n'));
  assert.ok(block, '/themes/schema/* block');
  assert.match(block, /^ {2}Content-Type: application\/schema\+json$/m);
  assert.match(block, /^ {2}Access-Control-Allow-Origin: \*$/m);
});
