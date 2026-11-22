// The import page (https://sshterm.iru-yo.com/import#k=<key>): SSH Term
// Desktop shows it as a QR for スマホ版から取り込む. It reads only k from the
// fragment, which never reaches this server: the desktop's X25519 public key,
// base64url without padding, 32 bytes. Its button opens sshtermx://import?k=…,
// where the app lets you pick the hosts to put in 取り込みのファイル; the page
// never goes there on its own. It never shows or sends k, stores nothing and
// loads nothing else.

import { localize, pickLang, platformOf } from './common.js';

/** The k of a location.hash when it is base64url (no padding) of 32 bytes; null otherwise. */
export function keyFromHash(hash) {
  const ks = new URLSearchParams(String(hash).replace(/^#/, '')).getAll('k');
  if (ks.length !== 1) return null;
  const [k] = ks;
  // 32 bytes are 43 characters; the last holds 4 bits, so its low 2 bits are 0.
  return /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(k) ? k : null;
}

/** The app link the button opens. */
export function appLink(k) {
  return `sshtermx://import?k=${k}`;
}

export const STRINGS = {
  en: {
    htmlLang: 'en',
    invalid: 'This page was opened from a broken QR code. Show the QR in SSH Term Desktop again and scan it.',
    title: 'Copy hosts to SSH Term',
    body: 'You opened this page from the QR code shown in SSH Term Desktop. Open SSH Term with the button below and choose the hosts to copy to the desktop app.',
    open: 'Open in SSH Term',
    desktop: 'Open this page on your phone: scan the QR code shown in SSH Term Desktop with your phone’s camera.',
    trouble: "If it doesn't open",
    inApp: 'In-app browsers may not open it. Choose “Open in browser” from the menu.',
    getApp: "Don't have SSH Term?",
  },
  ja: {
    htmlLang: 'ja',
    invalid: 'このページを開いた QR は壊れています。SSH Term Desktop で QR を出し直して、もう一度読んでください。',
    title: 'SSH Term にホストを写す',
    body: 'このページは、SSH Term Desktop に表示された QR から開いたページです。下のボタンで SSH Term を開き、デスクトップ版へ写すホストを選んでください。',
    open: 'SSH Term で開く',
    desktop: 'このページはスマホで開いてください。SSH Term Desktop に表示された QR を、スマホのカメラで読みます。',
    trouble: '開かないときは',
    inApp: 'アプリ内のブラウザでは開けないことがあります。メニューから「ブラウザで開く」を選んでください。',
    getApp: 'SSH Term をお持ちでない方へ',
  },
  ko: {
    htmlLang: 'ko',
    invalid: '이 페이지를 연 QR 코드가 손상되었습니다. SSH Term Desktop에서 QR 코드를 다시 표시하고 다시 스캔하세요.',
    title: 'SSH Term으로 호스트 옮기기',
    body: 'SSH Term Desktop에 표시된 QR 코드로 연 페이지입니다. 아래 버튼으로 SSH Term을 열고 데스크톱 앱으로 옮길 호스트를 선택하세요.',
    open: 'SSH Term에서 열기',
    desktop: '이 페이지는 휴대폰에서 여세요. SSH Term Desktop에 표시된 QR 코드를 휴대폰 카메라로 스캔합니다.',
    trouble: '열리지 않을 때',
    inApp: '앱 내 브라우저에서는 열리지 않을 수 있습니다. 메뉴에서 ‘브라우저에서 열기’를 선택하세요.',
    getApp: 'SSH Term이 없으신가요?',
  },
  zh: {
    htmlLang: 'zh-Hans',
    invalid: '打开此页面的二维码已损坏。请在 SSH Term Desktop 中重新显示二维码并再次扫描。',
    title: '将主机复制到 SSH Term',
    body: '此页面是通过 SSH Term Desktop 显示的二维码打开的。请用下方按钮打开 SSH Term，并选择要复制到桌面版的主机。',
    open: '在 SSH Term 中打开',
    desktop: '请在手机上打开此页面：用手机相机扫描 SSH Term Desktop 显示的二维码。',
    trouble: '无法打开时',
    inApp: '应用内浏览器可能无法打开。请从菜单中选择“在浏览器中打开”。',
    getApp: '还没有 SSH Term？',
  },
  zh_Hant: {
    htmlLang: 'zh-Hant',
    invalid: '開啟此頁面的 QR 碼已損壞。請在 SSH Term Desktop 中重新顯示 QR 碼並再次掃描。',
    title: '將主機複製到 SSH Term',
    body: '此頁面是透過 SSH Term Desktop 顯示的 QR 碼開啟的。請用下方按鈕開啟 SSH Term，並選擇要複製到桌面版的主機。',
    open: '在 SSH Term 中開啟',
    desktop: '請在手機上開啟此頁面：用手機相機掃描 SSH Term Desktop 顯示的 QR 碼。',
    trouble: '無法開啟時',
    inApp: 'App 內建的瀏覽器可能無法開啟。請從選單中選擇「在瀏覽器中開啟」。',
    getApp: '還沒有 SSH Term？',
  },
};

/** How long the page may stay in front after the button before it offers help. */
const LEFT_TIMEOUT_MS = 2000;

/**
 * Fills the page from [env]'s location.hash. Returns what it showed:
 * 'import' or 'invalid'. [env] defaults to the browser's globals; tests pass
 * their own.
 */
export function main(env = globalThis) {
  const { document: doc, location, navigator } = env;
  const t = STRINGS[pickLang(navigator.language, STRINGS)];
  const $ = (id) => doc.getElementById(id);
  localize(t, doc);

  const k = keyFromHash(location.hash);
  if (!k) {
    $('invalid').hidden = false;
    return 'invalid';
  }
  $('ready').hidden = false;
  const button = $('open');
  button.href = appLink(k);
  button.hidden = false;

  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
  if (platform === 'desktop') {
    $('desktop').hidden = false;
    return 'import';
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
    return 'import';
  }
  let timer;
  button.addEventListener('click', () => {
    clearTimeout(timer);
    timer = setTimeout(showTrouble, LEFT_TIMEOUT_MS);
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') clearTimeout(timer);
  });
  return 'import';
}

if (typeof document !== 'undefined') main();
