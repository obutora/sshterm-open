// The purchase-complete page of SSH Term Desktop (/desktop/purchased,
// /ja/desktop/purchased). Stripe's Checkout comes back here with
// ?session_id=cs_…; the page sends that id, and the page's language for the
// email, to the license Worker on the same origin (POST /api/license), and
// shows the key it returns and an "Open in the app" button with the key's
// link. The Worker gives the same key for the same session every time, so a
// reload shows the same key. The page stores nothing.

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,250}$/;
const LINK_PREFIX = 'sshterm-desktop://license/';

export const STRINGS = {
  en: {
    loading: 'Checking your payment…',
    done: 'Thank you for buying SSH Term Desktop. Here is your license key. We have also sent it to your email.',
    notPaid: 'The payment is not confirmed yet. Wait a moment and reload this page.',
    noSession: 'This page shows the license key after you buy SSH Term Desktop.',
    failed: 'Could not get the license key. Reload this page in a moment. If it still fails, use the contact form.',
    copy: 'Copy',
    copied: 'Copied',
  },
  ja: {
    loading: 'お支払いを確かめています…',
    done: 'SSH Term Desktop をお買い上げいただき、ありがとうございます。ライセンスキーです。同じキーをメールでもお送りしました。',
    notPaid: 'お支払いがまだ確かめられません。少し待ってから、このページを読み込み直してください。',
    noSession: 'このページには、SSH Term Desktop を買ったあとにライセンスキーが出ます。',
    failed: 'ライセンスキーを受け取れませんでした。少し待ってから、このページを読み込み直してください。それでもだめなら、お問い合わせのフォームからお知らせください。',
    copy: 'コピー',
    copied: 'コピーしました',
  },
};

/** The Checkout Session id in [search] (?session_id=cs_…, once), or null. */
export function sessionIdFrom(search) {
  const ids = new URLSearchParams(search).getAll('session_id');
  return ids.length === 1 && SESSION_ID.test(ids[0]) ? ids[0] : null;
}

export async function run({ document, location, fetch, navigator }) {
  const lang = document.documentElement.lang === 'ja' ? 'ja' : 'en';
  const t = STRINGS[lang];
  const $ = (id) => document.getElementById(id);
  const say = (text) => { $('status').textContent = text; };

  const sessionId = sessionIdFrom(location.search);
  if (!sessionId) return say(t.noSession);

  say(t.loading);
  let res, body;
  try {
    res = await fetch('/api/license', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, lang }),
    });
    body = await res.json();
  } catch {
    return say(t.failed);
  }
  if (res.status === 402) return say(t.notPaid);
  const { key, link } = body ?? {};
  if (!res.ok || typeof key !== 'string' || link !== LINK_PREFIX + key) return say(t.failed);

  $('key').value = key;
  $('open').href = link;
  const copy = $('copy');
  copy.textContent = t.copy;
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(key);
    copy.textContent = t.copied;
  });
  $('result').hidden = false;
  say(t.done);
}

if (typeof document !== 'undefined') run({ document, location, fetch: fetch.bind(globalThis), navigator });
