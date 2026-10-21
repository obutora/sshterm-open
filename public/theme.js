// The theme page (https://sshterm.iru-yo.com/theme#t=<theme>): the 見本 of
// one SSH Term theme sent as a link. It reads only t from the fragment, which
// never reaches this server, inflates it (stopping past 64KB), checks it with
// the app's rules (theme-format.js) and draws the theme in a terminal-like
// frame. Its button opens the theme in SSH Term as sshtermx://theme?t=…; the
// page never goes there on its own. It stores nothing and loads nothing else.

import { localize, pickLang, platformOf } from './common.js';
import { decodeThemeLink } from './theme-format.js';

/** The t of a location.hash, or null when it is missing or repeated. */
export function paramFromHash(hash) {
  const ts = new URLSearchParams(String(hash).replace(/^#/, '')).getAll('t');
  return ts.length === 1 && ts[0] !== '' ? ts[0] : null;
}

/** The app link the button opens. */
export function appLink(t) {
  return `sshtermx://theme?t=${t}`;
}

/** The theme of a location.hash: {ok: true, theme, t} or {ok: false, reason}. */
export async function themeFromHash(hash) {
  const t = paramFromHash(hash);
  if (!t) return { ok: false, reason: 'noT' };
  const decoded = await decodeThemeLink(t);
  return decoded.ok ? { ...decoded, t } : decoded;
}

export const STRINGS = {
  en: {
    htmlLang: 'en',
    invalid: 'This theme link is broken.',
    author: 'By {}',
    basedOn: 'Based on {}',
    open: 'Open in SSH Term',
    desktop: 'Open this link on your phone to add the theme to SSH Term.',
    trouble: "If it doesn't open",
    inApp: 'In-app browsers may not open it. Choose “Open in browser” from the menu.',
    getApp: "Don't have SSH Term?",
  },
  ja: {
    htmlLang: 'ja',
    invalid: 'このテーマのリンクは壊れています。',
    author: '作者: {}',
    basedOn: '元にしたテーマ: {}',
    open: 'SSH Term で開く',
    desktop: 'スマホでこのリンクを開くと、SSH Term にテーマを追加できます。',
    trouble: '開かないときは',
    inApp: 'アプリ内のブラウザでは開けないことがあります。メニューから「ブラウザで開く」を選んでください。',
    getApp: 'SSH Term をお持ちでない方へ',
  },
  ko: {
    htmlLang: 'ko',
    invalid: '이 테마 링크는 손상되었습니다.',
    author: '작성자: {}',
    basedOn: '원본 테마: {}',
    open: 'SSH Term에서 열기',
    desktop: '휴대폰에서 이 링크를 열면 SSH Term에 테마를 추가할 수 있습니다.',
    trouble: '열리지 않을 때',
    inApp: '앱 내 브라우저에서는 열리지 않을 수 있습니다. 메뉴에서 ‘브라우저에서 열기’를 선택하세요.',
    getApp: 'SSH Term이 없으신가요?',
  },
  zh: {
    htmlLang: 'zh-Hans',
    invalid: '此主题链接已损坏。',
    author: '作者：{}',
    basedOn: '基于主题：{}',
    open: '在 SSH Term 中打开',
    desktop: '在手机上打开此链接，即可将主题添加到 SSH Term。',
    trouble: '无法打开时',
    inApp: '应用内浏览器可能无法打开。请从菜单中选择“在浏览器中打开”。',
    getApp: '还没有 SSH Term？',
  },
  zh_Hant: {
    htmlLang: 'zh-Hant',
    invalid: '此主題連結已損壞。',
    author: '作者：{}',
    basedOn: '基於主題：{}',
    open: '在 SSH Term 中開啟',
    desktop: '在手機上開啟此連結，即可將主題加入 SSH Term。',
    trouble: '無法開啟時',
    inApp: 'App 內建的瀏覽器可能無法開啟。請從選單中選擇「在瀏覽器中開啟」。',
    getApp: '還沒有 SSH Term？',
  },
};

/** How long the page may stay in front after the button before it offers help. */
const LEFT_TIMEOUT_MS = 2000;

/** "Name (author · licence)" of a 元にしたテーマ. */
export function basedOnText(basedOn) {
  const more = [basedOn.author, basedOn.license].filter(Boolean).join(' · ');
  return more ? `${basedOn.name} (${more})` : basedOn.name;
}

/** The 見本's lines: [text, colour key | null (前景), extra class][]. The gallery's pages draw the same. */
export const SAMPLE = [
  [['~/dev ', 'blue'], ['$ ', 'green'], ['ls', null]],
  [['README.md  ', null], ['src/  ', 'brightBlue'], ['run.sh  ', 'brightGreen'], ['notes.txt', 'yellow']],
  [['~/dev ', 'blue'], ['$ ', 'green'], ['git status', null, 'selection']],
  [['modified: ', 'red'], ['src/app.js', 'magenta']],
  [['ok ', 'cyan'], ['warning ', 'brightYellow'], ['error', 'brightRed']],
  [['~/dev ', 'blue'], ['$ ', 'green'], [' ', null, 'cursor']],
];

/** Draws [theme] into [frame] (the terminal-like box) with doc's elements. */
function drawSample(doc, frame, theme) {
  const c = theme.colors;
  frame.style.setProperty('background-color', c.background);
  frame.style.setProperty('color', c.foreground);
  for (const line of SAMPLE) {
    const row = doc.createElement('div');
    row.className = 'line';
    for (const [text, key, extra] of line) {
      const span = doc.createElement('span');
      span.textContent = text;
      if (key) span.style.setProperty('color', c[key]);
      if (extra === 'selection') span.style.setProperty('background-color', c.selection);
      if (extra === 'cursor') span.style.setProperty('background-color', c.cursor);
      row.append(span);
    }
    frame.append(row);
  }
  const palette = doc.createElement('div');
  palette.className = 'palette';
  for (const key of ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
    'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']) {
    const swatch = doc.createElement('span');
    swatch.className = 'swatch';
    swatch.title = key;
    swatch.style.setProperty('background-color', c[key]);
    palette.append(swatch);
  }
  frame.append(palette);
}

/**
 * Fills the page from [env]'s location.hash. Resolves to what it showed:
 * 'theme' or 'invalid'. [env] defaults to the browser's globals; tests pass
 * their own.
 */
export async function main(env = globalThis) {
  const { document: doc, location, navigator } = env;
  const t = STRINGS[pickLang(navigator.language, STRINGS)];
  const $ = (id) => doc.getElementById(id);
  localize(t, doc);

  const found = await themeFromHash(location.hash);
  if (!found.ok) {
    $('invalid').hidden = false;
    return 'invalid';
  }
  const { theme } = found;
  $('name').textContent = theme.name;
  $('author').textContent = t.author.replace('{}', theme.author);
  $('license').textContent = theme.license;
  if (theme.basedOn) {
    $('basedOn').textContent = t.basedOn.replace('{}', basedOnText(theme.basedOn));
    $('basedOn').hidden = false;
  }
  drawSample(doc, $('sample'), theme);
  $('theme').hidden = false;

  const button = $('open');
  button.href = appLink(found.t);
  button.hidden = false;

  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
  if (platform === 'desktop') {
    $('desktop').hidden = false;
    return 'theme';
  }
  // No redirect on load: the button opens the app. If the page is still in
  // front a while after it, or in an Android WebView, help shows.
  const showTrouble = () => {
    if (platform === 'android' || platform === 'android-wv') {
      $('stores').prepend($('play'));
    }
    $('trouble').hidden = false;
  };
  if (platform === 'android-wv') {
    showTrouble();
    return 'theme';
  }
  let timer;
  button.addEventListener('click', () => {
    clearTimeout(timer);
    timer = setTimeout(showTrouble, LEFT_TIMEOUT_MS);
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') clearTimeout(timer);
  });
  return 'theme';
}

if (typeof document !== 'undefined') main();
