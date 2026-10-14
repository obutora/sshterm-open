// The open page (https://sshterm.iru-yo.com/open#h=<host_id>&s=<session id>).
// It reads h and s from the fragment, which never reaches this server,
// checks their form and hands them to SSH Term as
// sshtermx://open?h=…[&s=…]. It stores nothing and loads nothing else.

import { localize, pickLang, platformOf } from './common.js';

const HOST_ID = /^[0-9a-f]{32}$/;
const SESSION_ID = /^[0-9a-f]{16}$/;

/**
 * The SSH Term link for a location.hash, or null when h is missing or
 * either h or s is malformed or given twice. Other keys are dropped.
 */
export function linkFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const hs = params.getAll('h');
  const ss = params.getAll('s');
  if (hs.length !== 1 || !HOST_ID.test(hs[0]) || ss.length > 1) return null;
  if (ss.length === 1 && !SESSION_ID.test(ss[0])) return null;
  return `sshtermx://open?h=${hs[0]}` + (ss.length === 1 ? `&s=${ss[0]}` : '');
}

export const STRINGS = {
  en: {
    htmlLang: 'en',
    open: 'Open in SSH Term',
    desktop: 'This link opens in SSH Term on your phone.',
    invalid: "This link can't be opened in SSH Term.",
    trouble: "If it doesn't open",
    inApp: 'In-app browsers may not open it. Choose “Open in browser” from the menu.',
    owner: 'This link is for SSH Term on the phone that set up the notification.',
    getApp: "Don't have SSH Term?",
  },
  ja: {
    htmlLang: 'ja',
    open: 'SSH Term で開く',
    desktop: 'スマホの SSH Term で開くリンクです。',
    invalid: 'このリンクは SSH Term で開けません。',
    trouble: '開かないときは',
    inApp: 'アプリ内のブラウザでは開けないことがあります。メニューから「ブラウザで開く」を選んでください。',
    owner: 'このリンクは、通知を設定したスマホの SSH Term で開くためのものです。',
    getApp: 'SSH Term をお持ちでない方へ',
  },
  ko: {
    htmlLang: 'ko',
    open: 'SSH Term에서 열기',
    desktop: '휴대폰의 SSH Term에서 여는 링크입니다.',
    invalid: '이 링크는 SSH Term에서 열 수 없습니다.',
    trouble: '열리지 않을 때',
    inApp: '앱 내 브라우저에서는 열리지 않을 수 있습니다. 메뉴에서 ‘브라우저에서 열기’를 선택하세요.',
    owner: '이 링크는 알림을 설정한 휴대폰의 SSH Term에서 열기 위한 것입니다.',
    getApp: 'SSH Term이 없으신가요?',
  },
  zh: {
    htmlLang: 'zh-Hans',
    open: '在 SSH Term 中打开',
    desktop: '此链接需要在手机上的 SSH Term 中打开。',
    invalid: 'SSH Term 无法打开此链接。',
    trouble: '无法打开时',
    inApp: '应用内浏览器可能无法打开。请从菜单中选择“在浏览器中打开”。',
    owner: '此链接用于在设置了通知的手机上的 SSH Term 中打开。',
    getApp: '还没有 SSH Term？',
  },
  zh_Hant: {
    htmlLang: 'zh-Hant',
    open: '在 SSH Term 中開啟',
    desktop: '此連結需要在手機上的 SSH Term 中開啟。',
    invalid: 'SSH Term 無法開啟此連結。',
    trouble: '無法開啟時',
    inApp: 'App 內建的瀏覽器可能無法開啟。請從選單中選擇「在瀏覽器中開啟」。',
    owner: '此連結用於在設定了通知的手機上的 SSH Term 中開啟。',
    getApp: '還沒有 SSH Term？',
  },
};

/**
 * How long the page may keep focus after the redirect, without being hidden,
 * before it offers help.
 */
const LEFT_TIMEOUT_MS = 2000;

function main() {
  const t = STRINGS[pickLang(navigator.language, STRINGS)];
  const $ = (id) => document.getElementById(id);
  localize(t);

  const link = linkFromHash(location.hash);
  if (!link) {
    $('invalid').hidden = false;
    return;
  }
  const button = $('open');
  button.href = link;
  button.hidden = false;

  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
  if (platform === 'desktop') {
    $('desktop').hidden = false;
    return;
  }
  const showTrouble = () => {
    if (platform === 'android' || platform === 'android-wv') {
      $('stores').prepend($('play'));
    }
    $('trouble').hidden = false;
  };
  // In an app's own WebView, a redirect to a custom scheme replaces the
  // page with an error page.
  if (platform === 'android-wv') {
    showTrouble();
    return;
  }
  // Only a hidden page means the app came up. iOS asks "Open in SSH Term?"
  // over the page first, which blurs it without hiding it, so the wait
  // pauses while the page is blurred and starts over when it gets focus
  // back (Cancel, or the switch to the app before the page is hidden).
  let left = false;
  let timer;
  const wait = () => {
    clearTimeout(timer);
    if (!left) timer = setTimeout(showTrouble, LEFT_TIMEOUT_MS);
  };
  window.addEventListener('blur', () => clearTimeout(timer));
  window.addEventListener('focus', wait);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    left = true;
    clearTimeout(timer);
  });
  wait();
  location.replace(link);
}

if (typeof document !== 'undefined') main();
