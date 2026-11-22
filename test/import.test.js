import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appLink, keyFromHash, main, STRINGS } from '../public/import.js';
import { fakePage } from './fake-dom.js';
import { headersFor } from './headers.js';

const key = (bytes) => Buffer.from(bytes).toString('base64url');
const K = key(Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3));
const HASH = `#k=${K}`;

function show(hash, opts) {
  const page = fakePage(hash, { ...opts, page: 'import' });
  return { ...page, shown: main(page.env) };
}

const UAS = {
  iphone: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 0],
  ipad: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5],
  android: ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 0],
  androidWebView: ['Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 0],
  desktop: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 0],
};

test('k is read alone and must be 32 bytes of base64url without padding', () => {
  assert.equal(keyFromHash(HASH), K);
  assert.equal(keyFromHash(`#x=1&k=${K}&h=2`), K);
  assert.equal(keyFromHash(`#k=${key(new Uint8Array(32).fill(255))}`), key(new Uint8Array(32).fill(255)));
  for (const hash of [
    '', '#', '#k=', `#x=${K}`, `#k=${K}&k=${K}`,
    `#k=${K}=`, `#k=${key(new Uint8Array(31))}`, `#k=${key(new Uint8Array(33))}`,
    `#k=${K.slice(0, 42)}+`, `#k=${K.slice(0, 42)}B`,
    `#k=${Buffer.from(new Uint8Array(32).fill(251)).toString('base64').replace(/=$/, '')}`,
  ]) {
    assert.equal(keyFromHash(hash), null, hash);
  }
  assert.equal(appLink(K), `sshtermx://import?k=${K}`);
});

test('a good k shows the explanation and the button to the app', () => {
  const { shown, $, doc } = show(HASH, { language: 'ja', ua: UAS.iphone[0] });
  assert.equal(shown, 'import');
  assert.equal(doc.documentElement.lang, 'ja');
  assert.equal($('ready').hidden, false);
  assert.equal($('invalid').hidden, true);
  assert.equal($('desktop').hidden, true);
  assert.equal($('open').hidden, false);
  assert.equal($('open').href, `sshtermx://import?k=${K}`);
  assert.equal($('open').textContent, 'SSH Term で開く');
  const texts = doc.all.map((el) => el.textContent);
  assert.ok(texts.includes('SSH Term にホストを写す'));
  assert.ok(!texts.some((s) => s.includes(K)), 'k is never shown');
});

test('a missing or bad k shows only the error', () => {
  for (const hash of ['', '#k=abc', `#k=${K}&k=${K}`]) {
    const { shown, $ } = show(hash);
    assert.equal(shown, 'invalid', hash);
    assert.equal($('invalid').hidden, false, hash);
    assert.equal($('ready').hidden, true, hash);
    assert.equal($('open').href, '', hash);
  }
});

test('opening the page never goes to sshtermx:// on any UA', () => {
  for (const [name, [ua, touch]] of Object.entries(UAS)) {
    for (const hash of [HASH, '#k=broken']) {
      const { navigations } = show(hash, { ua, maxTouchPoints: touch });
      assert.deepEqual(navigations, [], `${name} ${hash}`);
    }
  }
});

test('a computer is told to scan the QR with the phone; an Android WebView gets help at once', () => {
  const desktop = show(HASH, { ua: UAS.desktop[0], language: 'ja' });
  assert.equal(desktop.$('desktop').hidden, false);
  assert.equal(desktop.$('desktop').textContent, STRINGS.ja.desktop);
  const ipad = show(HASH, { ua: UAS.ipad[0], maxTouchPoints: 5 });
  assert.equal(ipad.$('desktop').hidden, true);
  const wv = show(HASH, { ua: UAS.androidWebView[0] });
  assert.equal(wv.$('trouble').hidden, false);
  assert.equal(wv.$('stores').children[0], wv.$('play'));
  assert.equal(show(HASH, { ua: UAS.iphone[0] }).$('trouble').hidden, true);
});

test('every language has every string', () => {
  const keys = Object.keys(STRINGS.en).sort();
  for (const [lang, strings] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(strings).sort(), keys, lang);
  }
  for (const lang of ['ja', 'ko', 'zh', 'zh_Hant', 'en']) assert.ok(STRINGS[lang]);
});

test('the page loads only its own script and styles and sends k nowhere', () => {
  const html = readFileSync(new URL('../public/import.html', import.meta.url), 'utf8');
  const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !u.startsWith('https://apps.apple.com') && !u.startsWith('https://play.google.com'));
  assert.deepEqual(srcs, ['/open.css', '/import.js']);
  assert.doesNotMatch(html, /style=|<script>/);
  const js = readFileSync(new URL('../public/import.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|location\.(replace|assign|href\s*=)|fetch|sendBeacon|XMLHttpRequest|WebSocket|localStorage|sessionStorage|cookie/);
});

test('_headers gives /import the CSP without connect-src, noindex and no-referrer', () => {
  for (const path of ['/import', '/import.html']) {
    const h = headersFor(path);
    assert.match(h.get('content-security-policy'), /^default-src 'none'; script-src 'self'; style-src 'self'/);
    assert.doesNotMatch(h.get('content-security-policy'), /connect-src/);
    assert.equal(h.get('x-robots-tag'), 'noindex');
    assert.equal(h.get('referrer-policy'), 'no-referrer');
  }
});
