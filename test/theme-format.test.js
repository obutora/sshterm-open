import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  checkThemeText, decodeThemeLink, encodeThemeLink, fillColors, inflateLimited,
  MAX_BYTES, MIN_CONTRAST, SCHEMA_URL, THEME_ID, contrastRatio, nameKey, themeText, validateThemeBytes,
  validateThemeDocument,
} from '../public/theme-format.js';

// test/fixtures/theme_format/ is a copy of the app's examples:
// what the app takes and refuses, and why. This module must agree.
const DIR = new URL('./fixtures/theme_format/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8'));

for (const c of manifest.cases) {
  test(`fixture ${c.file}`, () => {
    const got = validateThemeBytes(readFileSync(new URL(c.file, DIR)));
    if (c.valid) {
      assert.equal(got.ok, true, JSON.stringify(got.problems));
      assert.equal(got.themes.length, c.themes);
    } else {
      assert.equal(got.ok, false);
      const [p] = got.problems;
      assert.equal(p.reason, c.reason);
      assert.equal(p.theme, c.theme ?? null);
      assert.equal(p.field, c.field ?? null);
      if (c.textProblem) assert.equal(p.textProblem, c.textProblem);
    }
  });
}

test('every fixture file is in the manifest', () => {
  const files = ['pass', 'fail'].flatMap((d) =>
    readdirSync(new URL(`${d}/`, DIR)).map((f) => `${d}/${f}`));
  assert.deepEqual(files.sort(), manifest.cases.map((c) => c.file).sort());
});

test('the link the app made (fixture shared with ssh-term) decodes to Tide', async () => {
  const link = readFileSync(new URL('./fixtures/theme-link.txt', import.meta.url), 'utf8').trim();
  assert.ok(link.startsWith('https://sshterm.iru-yo.com/theme#t='));
  const got = await decodeThemeLink(link.split('#t=')[1]);
  assert.equal(got.ok, true);
  const { theme } = got;
  assert.equal(theme.id, '6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f');
  assert.equal(theme.name, 'Tide');
  assert.equal(theme.author, 'Haga');
  assert.equal(theme.license, 'MIT');
  assert.deepEqual(theme.basedOn, { name: 'Nordic', author: 'Someone', license: 'CC-BY-4.0' });
  assert.equal(theme.colors.selection, '#88C0D044');
  assert.equal(theme.colors.red, '#BF616A');
});

test('a link made here decodes back', async () => {
  const doc = JSON.parse(readFileSync(new URL('pass/full.json', DIR), 'utf8'));
  const got = await decodeThemeLink(await encodeThemeLink(doc));
  assert.equal(got.ok, true);
  assert.equal(got.theme.id, doc.themes[0].id);
});

test('inflating stops past 64KB; exactly 64KB passes', async () => {
  const deflate = async (n) => {
    const s = new Blob([new Uint8Array(n).fill(0x20)]).stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  };
  assert.equal((await inflateLimited(await deflate(MAX_BYTES))).bytes.length, MAX_BYTES);
  assert.deepEqual(await inflateLimited(await deflate(MAX_BYTES + 1)), { ok: false, reason: 'tooLarge' });
  // 50MB of spaces is refused without holding it.
  assert.deepEqual(await inflateLimited(await deflate(50 * 1024 * 1024)), { ok: false, reason: 'tooLarge' });
});

test('$schema is taken only as the v1 schema URL', () => {
  const doc = JSON.parse(readFileSync(new URL('pass/full.json', DIR), 'utf8'));
  assert.equal(validateThemeDocument({ $schema: SCHEMA_URL, ...doc }).ok, true);
  assert.equal(validateThemeDocument({ $schema: 'https://example.com/x.json', ...doc }).problems[0].reason, 'badSchema');
  assert.equal(validateThemeDocument({ $schema: 1, ...doc }).problems[0].reason, 'wrongType');
});

test('text rules: trim, 40 code points, forbidden characters', () => {
  assert.equal(themeText('  a b \u3000'), 'a b');
  assert.equal(checkThemeText(' '), 'empty');
  assert.equal(checkThemeText('😀'.repeat(40)), null);
  assert.equal(checkThemeText('😀'.repeat(41)), 'tooLong');
  for (const c of ['\u0000', '\u007f', '\u061c', '\u200e', '\u202e', '\u2066']) {
    assert.equal(checkThemeText(`a${c}b`), 'forbiddenCharacter', c.codePointAt(0).toString(16));
  }
});

test('missing optional colours are filled as the app does', () => {
  assert.deepEqual(fillColors({ foreground: '#F8F8F2', background: '#000000' }), {
    cursor: '#F8F8F2',
    selection: '#F8F8F266',
    searchHitBackground: '#FFB86C',
    searchHitBackgroundCurrent: '#FF79C6',
    searchHitForeground: '#282A36',
    foreground: '#F8F8F2',
    background: '#000000',
  });
});

test('THEME_ID and nameKey are the gallery\'s and the check\'s one definition', () => {
  for (const id of ['6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f', '00000000-0000-4000-8000-000000000000']) {
    assert.equal(THEME_ID.test(id), true, id);
  }
  for (const id of ['6F1C2B9E-3D4A-4B8C-9E7F-0A1B2C3D4E5F', '6f1c2b9e-3d4a-1b8c-9e7f-0a1b2c3d4e5f', '6f1c2b9e-3d4a-4b8c-7e7f-0a1b2c3d4e5f', 'x6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f']) {
    assert.equal(THEME_ID.test(id), false, id);
  }
  assert.equal(nameKey('Straße'), nameKey('STRASSE'));
  assert.equal(nameKey('Ｔｉｄｅ'), nameKey('tide'));
  assert.notEqual(nameKey('Tides'), nameKey('Tide'));
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21);
  assert.equal(MIN_CONTRAST, 4.5);
});

test('validateThemeBytes hands back the parsed document as it is', () => {
  const doc = { format: 'ssh-term-theme', formatVersion: 1, themes: [JSON.parse(readFileSync(new URL('./fixtures/theme_format/pass/required-colors-only.json', import.meta.url), 'utf8')).themes[0]] };
  const got = validateThemeBytes(new TextEncoder().encode(JSON.stringify(doc)));
  assert.equal(got.ok, true);
  assert.deepEqual(got.doc, doc);
});
