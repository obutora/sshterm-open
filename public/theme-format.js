// 形式 v1, the SSH Term theme document, and テーマのリンク: the same rules as
// the app, for the theme page (/theme), the gallery and its CI. Pure
// functions, no DOM: it loads in a browser and in Node.
//
// {"format": "ssh-term-theme", "formatVersion": 1, "themes": [...]}, with an
// optional "$schema" that is exactly SCHEMA_URL.

export const FORMAT = 'ssh-term-theme';
export const FORMAT_VERSION = 1;
export const MAX_THEMES = 32;
/** The largest document read, in bytes of UTF-8. */
export const MAX_BYTES = 64 * 1024;
export const SCHEMA_URL = 'https://sshterm.iru-yo.com/themes/schema/v1.json';
export const TEXT_MAX_CODE_POINTS = 40;
export const LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'MIT'];

/** The colour keys in the app's order. */
export const COLOR_KEYS = [
  'foreground', 'background', 'cursor', 'selection',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
  'searchHitBackground', 'searchHitBackgroundCurrent', 'searchHitForeground',
];
export const ANSI_KEYS = COLOR_KEYS.slice(4, 20);
/** The colours a document must have: 前景, 背景 and the 16 ANSI. */
export const REQUIRED_COLORS = ['foreground', 'background', ...ANSI_KEYS];
/** The search hits' colours a theme without them takes (the app's Dracula). */
export const DEFAULT_SEARCH_HITS = {
  searchHitBackground: '#FFB86C',
  searchHitBackgroundCurrent: '#FF79C6',
  searchHitForeground: '#282A36',
};
/** The opacity (of 255) a missing 選択 takes over the 前景: 40%. */
export const SELECTION_ALPHA = 0x66;

/** A theme's id: a lowercase UUID v4 (the gallery's file names are these too). */
export const THEME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COLOR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

/** True for a `#RRGGBB` or `#RRGGBBAA` colour (no surrounding spaces). */
export function isColor(value) {
  return typeof value === 'string' && COLOR.test(value);
}

// Dart's String.trim: Unicode White_Space and the BOM.
const SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);

/** [text] as it is kept: without the surrounding spaces. */
export function themeText(text) {
  const cps = Array.from(text);
  let start = 0;
  let end = cps.length;
  while (start < end && SPACE.has(cps[start].codePointAt(0))) start++;
  while (end > start && SPACE.has(cps[end - 1].codePointAt(0))) end--;
  return cps.slice(start, end).join('');
}

function forbidden(cp) {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x061c ||
    cp === 0x200e || cp === 0x200f || (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069);
}

/**
 * Null when [text], as themeText keeps it, is 1–40 code points with no
 * control characters and none that turn the direction; else 'empty',
 * 'tooLong' or 'forbiddenCharacter'.
 */
export function checkThemeText(text) {
  const kept = themeText(text);
  if (kept.length === 0) return 'empty';
  let count = 0;
  for (const ch of kept) {
    if (forbidden(ch.codePointAt(0))) return 'forbiddenCharacter';
    count++;
  }
  return count > TEXT_MAX_CODE_POINTS ? 'tooLong' : null;
}

class Problem {
  constructor(reason, theme = null, field = null, textProblem = null) {
    Object.assign(this, { reason, theme, field });
    if (textProblem) this.textProblem = textProblem;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.hasOwn(o, k);

function onlyKeys(map, known, theme = null, prefix = '') {
  for (const key of Object.keys(map)) {
    if (!known.includes(key)) throw new Problem('unknownField', theme, prefix + key);
  }
}

function readTheme(value, index) {
  const fail = (reason, field, text) => { throw new Problem(reason, index, field, text); };
  if (!isObject(value)) fail('wrongType', null);
  onlyKeys(value, ['id', 'name', 'author', 'license', 'basedOn', 'colors'], index);
  const need = (map, key, field, type) => {
    if (!has(map, key)) fail('missingField', field);
    const v = map[key];
    const ok = type === 'object' ? isObject(v) : typeof v === type;
    if (!ok) fail('wrongType', field);
    return v;
  };
  const text = (map, key, field) => {
    const v = need(map, key, field, 'string');
    const problem = checkThemeText(v);
    if (problem) fail('badText', field, problem);
    return themeText(v);
  };
  const license = (map, key, field) => {
    const v = need(map, key, field, 'string');
    if (!LICENSES.includes(v)) fail('badLicense', field);
    return v;
  };

  const id = need(value, 'id', 'id', 'string');
  if (!THEME_ID.test(id)) fail('badId', 'id');
  const theme = {
    id,
    name: text(value, 'name', 'name'),
    author: text(value, 'author', 'author'),
    license: license(value, 'license', 'license'),
  };
  if (has(value, 'basedOn')) {
    const map = need(value, 'basedOn', 'basedOn', 'object');
    onlyKeys(map, ['name', 'author', 'license'], index, 'basedOn.');
    theme.basedOn = { name: text(map, 'name', 'basedOn.name') };
    if (has(map, 'author')) theme.basedOn.author = text(map, 'author', 'basedOn.author');
    if (has(map, 'license')) theme.basedOn.license = license(map, 'license', 'basedOn.license');
  }
  const colorMap = need(value, 'colors', 'colors', 'object');
  onlyKeys(colorMap, COLOR_KEYS, index, 'colors.');
  const colors = {};
  for (const key of COLOR_KEYS) {
    if (!has(colorMap, key)) continue;
    if (!isColor(colorMap[key])) fail('badColor', `colors.${key}`);
    colors[key] = colorMap[key].toUpperCase();
  }
  for (const key of REQUIRED_COLORS) {
    if (!has(colors, key)) fail('missingColor', `colors.${key}`);
  }
  theme.colors = fillColors(colors);
  return theme;
}

/**
 * [colors] (which has REQUIRED_COLORS) with the missing optional ones filled
 * as the app does: the cursor is the 前景, the selection the 前景 at 40%
 * opacity, the search hits DEFAULT_SEARCH_HITS.
 */
export function fillColors(colors) {
  const fg = colors.foreground.slice(0, 7).toUpperCase();
  const alpha = SELECTION_ALPHA.toString(16).toUpperCase().padStart(2, '0');
  return {
    cursor: colors.foreground,
    selection: fg + alpha,
    ...DEFAULT_SEARCH_HITS,
    ...colors,
  };
}

function validate(obj) {
  if (!isObject(obj) || obj.format !== FORMAT) throw new Problem('notThemeFile');
  const version = obj.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Problem('badVersion', null, 'formatVersion');
  }
  if (version > FORMAT_VERSION) throw new Problem('newerVersion', null, 'formatVersion');
  onlyKeys(obj, ['$schema', 'format', 'formatVersion', 'themes']);
  if (has(obj, '$schema')) {
    if (typeof obj.$schema !== 'string') throw new Problem('wrongType', null, '$schema');
    if (obj.$schema !== SCHEMA_URL) throw new Problem('badSchema', null, '$schema');
  }
  if (!has(obj, 'themes')) throw new Problem('missingField', null, 'themes');
  const list = obj.themes;
  if (!Array.isArray(list)) throw new Problem('wrongType', null, 'themes');
  if (list.length === 0 || list.length > MAX_THEMES) {
    throw new Problem('themeCount', null, 'themes');
  }
  const themes = list.map(readTheme);
  const ids = new Set();
  themes.forEach((t, i) => {
    if (ids.has(t.id)) throw new Problem('duplicateId', i, 'id');
    ids.add(t.id);
  });
  return themes;
}

function result(fn) {
  try {
    return { ok: true, themes: fn() };
  } catch (e) {
    if (e instanceof Problem) return { ok: false, problems: [{ ...e }] };
    throw e;
  }
}

/**
 * Checks a parsed document. {ok: true, themes} (names and 作者 trimmed,
 * missing optional colours filled, colours upper case), or {ok: false,
 * problems: [{theme, field, reason, textProblem?}]}: the first problem, as
 * the app finds it. reason is the problem's code; theme the
 * 0-based index in themes (null for the document's own fields); field a
 * dotted path (`name`, `basedOn.author`, `colors.red`, `formatVersion`).
 */
export function validateThemeDocument(obj) {
  return result(() => validate(obj));
}

/**
 * validateThemeDocument for raw bytes (Uint8Array) of UTF-8 JSON; when ok,
 * also the parsed document as it is (doc), for a JSON Schema to check.
 */
export function validateThemeBytes(bytes) {
  let doc;
  const checked = result(() => {
    if (bytes.length > MAX_BYTES) throw new Problem('tooLarge');
    try {
      // A BOM is kept, so JSON.parse refuses it as the app does.
      doc = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    } catch {
      throw new Problem('notJson');
    }
    return validate(doc);
  });
  return checked.ok ? { ...checked, doc } : checked;
}

// テーマのリンク: t = one theme's document, deflate-raw, base64url (no padding).

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** `t` as bytes, or null when it is not base64url without padding. */
export function base64UrlDecode(t) {
  if (typeof t !== 'string' || !BASE64URL.test(t) || t.length % 4 === 1) return null;
  const bin = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function base64UrlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * [deflated] inflated (deflate-raw), counted as it streams and stopped past
 * [limit] bytes. Resolves {ok: true, bytes} or {ok: false, reason:
 * 'tooLarge' | 'notDeflate'}.
 */
export async function inflateLimited(deflated, limit = MAX_BYTES) {
  const stream = new Blob([deflated]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        reader.cancel().catch(() => {});
        return { ok: false, reason: 'tooLarge' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'notDeflate' };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return { ok: true, bytes };
}

/**
 * The theme of a link's `t`: {ok: true, theme} or {ok: false, reason}, where
 * reason is 'notBase64url', 'notDeflate', 'tooLarge', 'themeCount' (not
 * exactly one theme) or a validateThemeBytes problem (then also problems).
 */
export async function decodeThemeLink(t) {
  const deflated = base64UrlDecode(t);
  if (!deflated) return { ok: false, reason: 'notBase64url' };
  const inflated = await inflateLimited(deflated);
  if (!inflated.ok) return inflated;
  const checked = validateThemeBytes(inflated.bytes);
  if (!checked.ok) return { ok: false, reason: checked.problems[0].reason, problems: checked.problems };
  if (checked.themes.length !== 1) return { ok: false, reason: 'themeCount' };
  return { ok: true, theme: checked.themes[0] };
}

/** The `t` of a document (an object), as the app makes it. */
export async function encodeThemeLink(doc) {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return base64UrlEncode(new Uint8Array(await new Response(stream).arrayBuffer()));
}

// ── The gallery's ───────────────────────────────────────────────────────────
// Not the app's rules: the gallery's build and sshterm-themes' check (through
// its vendored copy) share them from here.

/**
 * What two names that the gallery counts as the same share: NFKC with the
 * case folded (upper then lower case, so ß and SS meet), then NFKC again.
 */
export function nameKey(name) {
  return name.normalize('NFKC').toUpperCase().toLowerCase().normalize('NFKC');
}

/** The gallery's least contrast of the 前景 on the 背景 (WCAG 2). */
export const MIN_CONTRAST = 4.5;

const channels = (hex) => [1, 3, 5, 7].map((i) => parseInt(hex.slice(i, i + 2) || 'FF', 16));

function luminanceOf([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The WCAG relative luminance of a #RRGGBB(AA) colour; its alpha is not counted. */
export function relativeLuminance(color) {
  return luminanceOf(channels(color));
}

/**
 * The WCAG 2 contrast ratio (1–21) of [foreground] on [background], both
 * `#RRGGBB` or `#RRGGBBAA` (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
 * The 前景 is laid over the 背景 by its opacity; the 背景's own opacity is not
 * counted (what is behind the terminal is not known).
 */
export function contrastRatio(foreground, background) {
  const [fr, fg, fb, fa] = channels(foreground);
  const bg = channels(background).slice(0, 3);
  const a = fa / 255;
  const over = [fr, fg, fb].map((c, i) => c * a + bg[i] * (1 - a));
  const [hi, lo] = [luminanceOf(over), luminanceOf(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
