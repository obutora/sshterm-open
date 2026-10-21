import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appLink, main, paramFromHash, STRINGS } from '../public/theme.js';
import { base64UrlEncode, encodeThemeLink } from '../public/theme-format.js';
import { fakePage } from './fake-dom.js';

const FIXTURE = readFileSync(new URL('./fixtures/theme-link.txt', import.meta.url), 'utf8').trim();
const HASH = FIXTURE.slice(FIXTURE.indexOf('#'));
const T = HASH.slice('#t='.length);

const doc = (theme) => ({ format: 'ssh-term-theme', formatVersion: 1, themes: [theme] });
const tide = () => ({
  id: '6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f',
  name: 'Tide',
  author: 'Haga',
  license: 'MIT',
  colors: Object.fromEntries([
    'foreground', 'background', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan',
    'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue',
    'brightMagenta', 'brightCyan', 'brightWhite',
  ].map((k, i) => [k, `#0000${i.toString(16).padStart(2, '0').toUpperCase()}`])),
});

async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function show(hash, opts) {
  const page = fakePage(hash, opts);
  const shown = await main(page.env);
  return { ...page, shown };
}

const UAS = {
  iphone: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 0],
  ipad: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5],
  android: ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 0],
  androidWebView: ['Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 0],
  desktop: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 0],
};

test('t is read alone; missing, empty or repeated is null', () => {
  assert.equal(paramFromHash('#t=abc'), 'abc');
  assert.equal(paramFromHash('#x=1&t=abc&h=2'), 'abc');
  for (const hash of ['', '#', '#t=', '#x=abc', '#t=a&t=a']) {
    assert.equal(paramFromHash(hash), null, hash);
  }
  assert.equal(appLink('abc'), 'sshtermx://theme?t=abc');
});

test("the app's link shows its name, author, licence, 元にしたテーマ and colours", async () => {
  const { shown, $, doc } = await show(HASH, { language: 'ja' });
  assert.equal(shown, 'theme');
  assert.equal($('theme').hidden, false);
  assert.equal($('invalid').hidden, true);
  assert.equal($('name').textContent, 'Tide');
  assert.equal($('author').textContent, '作者: Haga');
  assert.equal($('license').textContent, 'MIT');
  assert.equal($('basedOn').textContent, '元にしたテーマ: Nordic (Someone · CC-BY-4.0)');
  assert.equal($('basedOn').hidden, false);
  // Nord's background and foreground, and its 16 colours as swatches.
  assert.equal($('sample').styles['background-color'], '#2E3440');
  assert.equal($('sample').styles.color, '#D8DEE9');
  const swatches = doc.created.filter((el) => el.className === 'swatch');
  assert.equal(swatches.length, 16);
  assert.equal(swatches[1].styles['background-color'], '#BF616A');
  const sel = doc.created.find((el) => el.styles['background-color'] === '#88C0D044');
  assert.ok(sel, 'the selection colour is drawn');
  assert.equal($('open').hidden, false);
  assert.equal($('open').href, `sshtermx://theme?t=${T}`);
});

test('nothing but a broken-link line for a bad t', async () => {
  const bomb = base64UrlEncode(await deflate(new Uint8Array(200 * 1024).fill(0x20)));
  const rlo = tide();
  rlo.name = 'Ti\u202Ede';
  const two = doc(tide());
  two.themes.push({ ...tide(), id: '6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e50' });
  for (const [what, hash] of [
    ['no t', ''],
    ['another key', `#x=${T}`],
    ['t twice', `#t=${T}&t=${T}`],
    ['not base64url', `#t=${T}+/`],
    ['padding', `#t=${T}=`],
    ['not deflate', '#t=aGVsbG8'],
    ['over 64KB inflated', `#t=${bomb}`],
    ['U+202E in the name', `#t=${await encodeThemeLink(doc(rlo))}`],
    ['two themes', `#t=${await encodeThemeLink(two)}`],
  ]) {
    const { shown, $, doc: d } = await show(hash);
    assert.equal(shown, 'invalid', what);
    assert.equal($('invalid').hidden, false, what);
    assert.equal($('theme').hidden, true, what);
    assert.equal($('open').hidden, true, what);
    assert.equal($('open').href, '', what);
    assert.equal(d.created.length, 0, what);
  }
});

test('a name of markup is shown as text and makes no element', async () => {
  const theme = tide();
  theme.name = '<img src=x onerror=alert(1)>';
  theme.author = '<b>x</b>';
  const { shown, $, doc: d } = await show(`#t=${await encodeThemeLink(doc(theme))}`);
  assert.equal(shown, 'theme');
  assert.equal($('name').textContent, '<img src=x onerror=alert(1)>');
  assert.equal($('author').textContent, 'By <b>x</b>');
  assert.deepEqual([...new Set(d.created.map((el) => el.tagName))].sort(), ['DIV', 'SPAN']);
});

test('opening the page never goes to sshtermx:// on any UA', async () => {
  for (const [name, [ua, touch]] of Object.entries(UAS)) {
    for (const hash of [HASH, '#t=broken']) {
      const { navigations } = await show(hash, { ua, maxTouchPoints: touch });
      assert.deepEqual(navigations, [], `${name} ${hash.slice(0, 8)}`);
    }
  }
});

test('the store help shows at once only in an Android WebView', async () => {
  const [ua] = UAS.androidWebView;
  const { $ } = await show(HASH, { ua });
  assert.equal($('trouble').hidden, false);
  assert.equal($('stores').children[0], $('play'));
  const iphone = await show(HASH, { ua: UAS.iphone[0] });
  assert.equal(iphone.$('trouble').hidden, true);
  const desktop = await show(HASH, { ua: UAS.desktop[0] });
  assert.equal(desktop.$('desktop').hidden, false);
});

test('every language has every string', () => {
  const keys = Object.keys(STRINGS.en).sort();
  for (const [lang, strings] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(strings).sort(), keys, lang);
  }
  for (const key of ['ja', 'ko', 'zh', 'zh_Hant', 'en']) assert.ok(STRINGS[key]);
});

test('the page loads only its own script and styles', () => {
  const html = readFileSync(new URL('../public/theme.html', import.meta.url), 'utf8');
  const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !u.startsWith('https://apps.apple.com') && !u.startsWith('https://play.google.com'));
  assert.deepEqual(srcs, ['/open.css', '/theme.css', '/theme.js']);
  assert.doesNotMatch(html, /style=|<script>/);
  const js = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|location\.(replace|assign|href\s*=)/);
});

test('_headers gives /theme the CSP, noindex and no-referrer', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const blocks = headers.split(/\n(?=\S)/).map((b) => b.split('\n'));
  const applying = blocks.filter(([path]) => path === '/*' || path === '/theme' || path === '/theme.html');
  const lines = applying.flatMap((b) => b.slice(1).map((l) => l.trim()));
  assert.ok(lines.some((l) => /^Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'/.test(l)));
  assert.ok(lines.includes('X-Robots-Tag: noindex'));
  assert.ok(lines.includes('Referrer-Policy: no-referrer'));
  // No block loosens the policy for the theme page.
  assert.ok(!blocks.some(([path]) => /^\/theme(\.html)?$/.test(path) && path !== '/*'
    && blocks.find(([p]) => p === path).join('\n').includes('Content-Security-Policy')));
});
