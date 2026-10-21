// The theme gallery's build: reads sshterm-themes' main (with its whole
// history), checks every theme again with the app's rules and the gallery's,
// and writes the pages of https://sshterm.iru-yo.com/themes/ under public/.
// One theme that breaks a rule fails the whole build, so nothing is published.
// The pages load only the site's own JS, CSS and SVG, and its icon.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import qrcode from 'qrcode-generator';
import {
  ANSI_KEYS, COLOR_KEYS, FORMAT, FORMAT_VERSION, MAX_BYTES, MIN_CONTRAST, SCHEMA_URL, THEME_ID,
  contrastRatio, encodeThemeLink, isColor, nameKey, relativeLuminance, validateThemeBytes,
} from '../public/theme-format.js';
import { SAMPLE, basedOnText } from '../public/theme.js';
import { STRINGS } from '../public/themes/gallery.js';

export const SITE = 'https://sshterm.iru-yo.com';
export const DEFAULT_REPO = 'https://github.com/obutora/sshterm-themes.git';
const GITHUB_REPO = 'https://github.com/obutora/sshterm-themes';
const CONTRIBUTING = `${GITHUB_REPO}/blob/main/CONTRIBUTING.md`;
const TAKEDOWN = `${GITHUB_REPO}/issues/new/choose`;

/** The id a theme file of [name] (`<id>.json`) is named after, or null. */
function idOfFileName(name) {
  const id = name.endsWith('.json') ? name.slice(0, -'.json'.length) : '';
  return THEME_ID.test(id) ? id : null;
}

/** A GitHub login: letters, digits and single hyphens inside, up to 39. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

// ── Dark or light ───────────────────────────────────────────────────────────

/**
 * The luminance under which a background is dark: where white text and black
 * text have the same contrast on it ((L + 0.05)² = 1.05 × 0.05). The app's 8
 * dark presets are under it and its 8 light ones over it.
 */
export const DARK_LUMINANCE = Math.sqrt(1.05 * 0.05) - 0.05;

/** 'dark' or 'light', by the theme's 背景. */
export function toneOf(colors) {
  return relativeLuminance(colors.background) < DARK_LUMINANCE ? 'dark' : 'light';
}

// ── The rules ───────────────────────────────────────────────────────────────

/**
 * Checks the files under themes/ of sshterm-themes ([{path, file, bytes}]:
 * file false for a symlink or submodule). Every file must be
 * themes/<GitHub login>/<id>.json holding one theme that the app reads, the
 * file named after the theme's id, its 前景 at MIN_CONTRAST or more on its 背景;
 * no id or name (as nameKey compares them) twice. Returns {ok: true, themes: [{login, path, theme}]} or {ok: false,
 * problems: [{path, rule, ...detail}]} with every problem found.
 */
export function checkGallery(files) {
  const problems = [];
  const themes = [];
  const fail = (path, rule, detail = {}) => problems.push({ path, rule, ...detail });
  for (const { path, file, bytes } of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const parts = path.split('/');
    if (parts.length !== 3 || parts[0] !== 'themes') {
      fail(path, 'badPath');
      continue;
    }
    const [, login, name] = parts;
    if (!LOGIN.test(login)) {
      fail(path, 'badLogin');
      continue;
    }
    const fileId = idOfFileName(name);
    if (!fileId) {
      fail(path, 'badFileName');
      continue;
    }
    if (!file) {
      fail(path, 'notAFile');
      continue;
    }
    const checked = validateThemeBytes(bytes);
    if (!checked.ok) {
      fail(path, 'invalidTheme', checked.problems[0]);
      continue;
    }
    if (checked.themes.length !== 1) {
      fail(path, 'notOneTheme');
      continue;
    }
    const [theme] = checked.themes;
    if (theme.id !== fileId) {
      fail(path, 'idMismatch', { id: theme.id });
      continue;
    }
    const sameId = themes.find((t) => t.theme.id === theme.id);
    if (sameId) fail(path, 'idTaken', { by: sameId.path });
    const sameName = themes.find((t) => nameKey(t.theme.name) === nameKey(theme.name));
    if (sameName) fail(path, 'nameTaken', { name: theme.name, by: sameName.path });
    const ratio = contrastRatio(theme.colors.foreground, theme.colors.background);
    if (ratio < MIN_CONTRAST) fail(path, 'lowContrast', { ratio });
    themes.push({ login, path, theme });
  }
  return problems.length ? { ok: false, problems } : { ok: true, themes };
}

export class GalleryError extends Error {
  constructor(problems) {
    super(`${problems.length} problem(s) in sshterm-themes:\n${problems.map((p) => JSON.stringify(p)).join('\n')}`);
    this.problems = problems;
  }
}

// ── sshterm-themes ──────────────────────────────────────────────────────────

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 << 20,
    });
  } catch (e) {
    throw new Error(`git ${args.join(' ')} failed: ${e.stderr?.toString().trim() || e.message}`);
  }
}

/**
 * The files under themes/ at [ref] of the clone in [dir]: [{path, file,
 * bytes}]. Bytes are read only for regular files up to MAX_BYTES; a larger one
 * gets MAX_BYTES + 1 bytes, which the rules refuse as too large.
 */
function readThemeFiles(dir, ref) {
  const out = git(dir, ['ls-tree', '-r', '-l', '-z', ref, '--', 'themes/']).toString('utf8');
  return out.split('\0').filter(Boolean).map((entry) => {
    const [, mode, type, object, size, path] = entry.match(/^(\d+) (\w+) ([0-9a-f]+) +(\S+)\t(.*)$/s);
    const file = type === 'blob' && (mode === '100644' || mode === '100755');
    if (!file) return { path, file, bytes: null };
    const bytes = Number(size) > MAX_BYTES
      ? new Uint8Array(MAX_BYTES + 1)
      : new Uint8Array(git(dir, ['cat-file', 'blob', object]));
    return { path, file, bytes };
  });
}

/**
 * When each theme (by id, the file's name) first came to [ref] and last
 * changed there: Map id → {added, updated} (ISO dates of the commits on main
 * itself: a merged PR counts from its merge, not from the PR's own commits).
 * A theme moved to another directory keeps the date it first came.
 */
function themeDates(dir, ref) {
  const log = git(dir, ['-c', 'core.quotePath=false', 'log', '--first-parent', '-m', '--no-renames',
    '--format=\x01%cI', '--name-status', ref, '--', 'themes/']).toString('utf8');
  const dates = new Map();
  const instant = (iso) => Date.parse(iso);
  let date = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('\x01')) {
      date = line.slice(1);
      continue;
    }
    const [status, path] = line.split('\t');
    const id = path && idOfFileName(path.split('/').pop());
    if (!id) continue;
    const seen = dates.get(id) ?? { added: null, updated: date };
    if (instant(date) > instant(seen.updated)) seen.updated = date;
    if (status === 'A' && (!seen.added || instant(date) < instant(seen.added))) seen.added = date;
    dates.set(id, seen);
  }
  return dates;
}

/**
 * The gallery's themes from [repo] (a URL or a path git can clone) at the
 * branch [ref], oldest first: [{login, theme, added, updated}]. Throws a
 * GalleryError when any file breaks a rule.
 */
export function readGallery({ repo, ref }) {
  const dir = mkdtempSync(join(tmpdir(), 'sshterm-themes-'));
  try {
    git(tmpdir(), ['clone', '--quiet', '--bare', '--single-branch', '--branch', ref, repo, dir]);
    if (git(dir, ['rev-parse', '--is-shallow-repository']).toString().trim() !== 'false') {
      throw new Error(`${repo} came as a shallow clone; the build needs its whole history`);
    }
    const checked = checkGallery(readThemeFiles(dir, ref));
    if (!checked.ok) throw new GalleryError(checked.problems);
    const dates = themeDates(dir, ref);
    return checked.themes.map(({ login, path, theme }) => {
      const date = dates.get(theme.id);
      if (!date?.added) throw new Error(`no commit adds ${path}`);
      return { login, theme, ...date };
    }).sort((a, b) => Date.parse(a.added) - Date.parse(b.added) || a.theme.id.localeCompare(b.theme.id));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── HTML ────────────────────────────────────────────────────────────────────

/** Markup that goes in as it is. Everything else is escaped. */
class Html {
  constructor(text) {
    this.text = text;
  }

  toString() {
    return this.text;
  }
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

function piece(value) {
  if (value instanceof Html) return value.text;
  if (Array.isArray(value)) return value.map(piece).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

/** A template whose ${values} are escaped unless they are Html (or arrays of it). */
function html(strings, ...values) {
  return new Html(strings.reduce((out, s, i) => out + piece(values[i - 1]) + s));
}

const EN = STRINGS.en;
/** An element of the page's English text that gallery.js translates. */
const t = (tag, key, attrs = '') => html`<${new Html(tag)}${new Html(attrs)} data-t="${key}">${EN[key]}</${new Html(tag)}>`;

/** The colours of a theme as custom properties of .t-<id>, for its 見本. */
function colorRule(theme, keys) {
  const props = keys.map((key) => {
    const color = theme.colors[key];
    if (!isColor(color)) throw new Error(`not a colour: ${color}`);
    return `--t-${key}:${color};`;
  });
  return `.t-${theme.id}{${props.join('')}}\n`;
}

const LIST_COLORS = ['background', 'foreground', ...ANSI_KEYS.slice(0, 8)];
const PAGE_COLORS = COLOR_KEYS.slice(0, 20);

function shell({ title, description, canonical, css, body, titleKey }) {
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
<link rel="stylesheet" href="/themes/gallery.css">
${css.map((href) => html`<link rel="stylesheet" href="${href}">\n`)}<script type="module" src="/themes/gallery.js"></script>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`.text;
}

function about() {
  return html`<section class="about">
  ${t('h2', 'sendTitle')}
  ${t('p', 'send')}
  <p><a href="${CONTRIBUTING}" data-t="sendLink">${EN.sendLink}</a></p>
  ${t('h2', 'takedownTitle')}
  ${t('p', 'takedown')}
  <p><a href="${TAKEDOWN}" data-t="takedownLink">${EN.takedownLink}</a></p>
  <p><a href="/themes/format" data-t="formatLink">${EN.formatLink}</a></p>
</section>`;
}

function card({ theme }) {
  return html`  <li data-tone="${toneOf(theme.colors)}">
    <a href="/themes/${theme.id}/">
      <div class="mini t-${theme.id}" aria-hidden="true">
        <div class="line"><span class="c-blue">~</span> <span class="c-green">$</span> ls</div>
        <div class="swatches">${ANSI_KEYS.slice(0, 8).map((key) => html`<span class="sw-${key}"></span>`)}</div>
      </div>
      <h2 class="name">${theme.name}</h2>
    </a>
    <p class="meta"><span class="author">${theme.author}</span> · <span class="license">${theme.license}</span></p>
  </li>
`;
}

function indexPage(entries) {
  const list = entries.length
    ? html`<div id="filters" class="filters" hidden>
  <label>${t('span', 'search')} <input id="q" type="search" autocomplete="off" spellcheck="false"></label>
  <label>${t('span', 'tone')} <select id="tone">
    ${t('option', 'toneAll', ' value=""')}
    ${t('option', 'toneDark', ' value="dark"')}
    ${t('option', 'toneLight', ' value="light"')}
  </select></label>
</div>
<ul id="themes" class="cards">
${entries.map(card)}</ul>
${t('p', 'noMatch', ' id="none" class="note" hidden')}`
    : t('p', 'empty', ' class="note"');
  return shell({
    title: EN.title,
    titleKey: 'title',
    description: EN.intro,
    canonical: `${SITE}/themes/`,
    css: ['/themes/colors.css'],
    body: html`<h1><span class="prompt" aria-hidden="true">&gt;_</span> ${t('span', 'title')}</h1>
${t('p', 'intro', ' class="lead"')}
${list}
${about()}`,
  });
}

function sample(theme) {
  const lines = SAMPLE.map((line) => html`<div class="line">${line.map(([text, key, extra]) => {
    const classes = [key && `c-${key}`, extra === 'selection' && 'sel', extra === 'cursor' && 'cur'].filter(Boolean);
    return classes.length ? html`<span class="${classes.join(' ')}">${text}</span>` : html`<span>${text}</span>`;
  })}</div>\n`);
  return html`<div class="terminal t-${theme.id}" aria-hidden="true">
${lines}<div class="palette">${ANSI_KEYS.map((key) => html`<span class="sw-${key}"></span>`)}</div>
</div>`;
}

function fact(key, value) {
  return html`  <div>${t('dt', key)}<dd>${value}</dd></div>\n`;
}

function themePage({ login, theme }, link) {
  return shell({
    title: `${theme.name} · SSH Term`,
    description: `${theme.name} by ${theme.author}: a terminal color theme for SSH Term (${theme.license}).`,
    canonical: `${SITE}/themes/${theme.id}/`,
    css: [`/themes/${theme.id}/colors.css`],
    body: html`<p class="back"><span class="prompt" aria-hidden="true">&gt;_</span> <a href="/themes/" data-t="back">${EN.back}</a></p>
<h1 class="name">${theme.name}</h1>
${sample(theme)}
<dl class="facts">
${fact('author', theme.author)}${fact('license', theme.license)}${theme.basedOn ? fact('basedOn', basedOnText(theme.basedOn)) : ''}${fact('sentBy', html`<a href="https://github.com/${login}" rel="ugc">@${login}</a>`)}</dl>
<p><a class="button" href="${link.slice(SITE.length)}" data-t="open">${EN.open}</a></p>
<figure class="qr">
  <img src="/themes/${theme.id}/qr.svg" width="264" height="264" alt="">
  ${t('figcaption', 'qr')}
</figure>
<p><a href="/themes/${theme.id}/${theme.id}.json" download data-t="download">${EN.download}</a></p>
${about()}`,
  });
}

// ── The other files ─────────────────────────────────────────────────────────

/** The theme as the app writes it: the keys and colours in the app's order. */
function ordered(theme) {
  const out = { id: theme.id, name: theme.name, author: theme.author, license: theme.license };
  if (theme.basedOn) out.basedOn = theme.basedOn;
  out.colors = Object.fromEntries(COLOR_KEYS.map((key) => [key, theme.colors[key]]));
  return out;
}

/** [text] as a QR code (error correction L, as the app's): an SVG of black modules on white. */
export function qrSvg(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const margin = 4;
  let d = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) d += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  const size = n + 2 * margin;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>\n`;
}

function sitemap(entries) {
  const url = (loc, lastmod) => `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${escapeHtml(lastmod)}</lastmod>` : ''}</url>\n`;
  const newest = entries.map((e) => e.updated).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + url(`${SITE}/themes/`, newest)
    + url(`${SITE}/themes/format`)
    + entries.map((e) => url(`${SITE}/themes/${e.theme.id}/`, e.updated)).join('')
    + '</urlset>\n';
}

/**
 * What the build writes in public/themes/ besides a directory per theme
 * (named its id): siteFiles writes them, removeBuilt removes them. .gitignore
 * lists the same.
 */
const LIST_FILES = ['index.html', 'colors.css', 'sitemap.xml'];

/**
 * The files the gallery adds to public/, by path under it, for [entries]
 * (readGallery's, in their order).
 */
export async function siteFiles(entries) {
  const files = new Map();
  const [index, colors, map] = LIST_FILES;
  files.set(`themes/${index}`, indexPage(entries));
  files.set(`themes/${colors}`, entries.map((e) => colorRule(e.theme, LIST_COLORS)).join(''));
  files.set(`themes/${map}`, sitemap(entries));
  for (const entry of entries) {
    const { theme } = entry;
    const doc = { format: FORMAT, formatVersion: FORMAT_VERSION, themes: [ordered(theme)] };
    const link = `${SITE}/theme#t=${await encodeThemeLink(doc)}`;
    const dir = `themes/${theme.id}`;
    files.set(`${dir}/index.html`, themePage(entry, link));
    files.set(`${dir}/colors.css`, colorRule(theme, PAGE_COLORS));
    files.set(`${dir}/qr.svg`, qrSvg(link));
    files.set(`${dir}/${theme.id}.json`, `${JSON.stringify({ $schema: SCHEMA_URL, ...doc }, null, 2)}\n`);
  }
  return files;
}

/** Removes what an earlier build wrote under [publicDir]. */
function removeBuilt(publicDir) {
  const themes = join(publicDir, 'themes');
  for (const name of readdirSync(themes)) {
    if (THEME_ID.test(name) || LIST_FILES.includes(name)) {
      rmSync(join(themes, name), { recursive: true, force: true });
    }
  }
}

/**
 * Builds the gallery from [repo] at [ref] into [publicDir]. Every file is made
 * before any is written, so a failing build leaves public/ as it was.
 * Resolves to the number of themes.
 */
export async function buildGallery({ repo = DEFAULT_REPO, ref = 'main', publicDir, log = console.log }) {
  const entries = readGallery({ repo, ref });
  const files = await siteFiles(entries);
  removeBuilt(publicDir);
  for (const [path, content] of files) {
    const file = join(publicDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  log(`The gallery: ${entries.length} theme(s) from ${repo} (${ref}).`);
  return entries.length;
}
