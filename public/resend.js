// The resend page of SSH Term Desktop (/desktop/resend, /ja/desktop/resend).
// Someone who lost their license key enters the email address they bought
// with. The page sends it, the page's language and the Cloudflare Turnstile
// token to the license Worker on the same origin (POST /api/license/resend).
// The Worker answers the same whether or not that address bought, and emails
// the same key as the purchase to that address only, so the page always says
// "if it bought, the key is on its way". The page stores nothing.

export const STRINGS = {
  en: {
    sending: 'Sending…',
    sent: 'If SSH Term Desktop was bought with this address, we have sent the license key to it. It can take a few minutes; check your spam folder too.',
    noToken: 'Finish the check above, then send again.',
    badEmail: 'Enter the email address you bought with.',
    tooMany: 'Too many tries. Wait a while and try again.',
    failed: 'Could not send. Try again in a moment. If it still fails, use the contact form.',
  },
  ja: {
    sending: '送っています…',
    sent: 'このアドレスで SSH Term Desktop を買っていれば、そのアドレスにライセンスキーを送りました。届くまで数分かかることがあります。迷惑メールのフォルダも見てください。',
    noToken: '上の確認を済ませてから、もう一度送ってください。',
    badEmail: '買ったときのメールアドレスを入れてください。',
    tooMany: '試した回数が多すぎます。しばらく待ってから、もう一度試してください。',
    failed: '送れませんでした。少し待ってから、もう一度試してください。それでもだめなら、お問い合わせのフォームからお知らせください。',
  },
};

const ANSWERS = { 202: 'sent', 400: 'badEmail', 403: 'noToken', 429: 'tooMany' };

export function run({ document, fetch, turnstile }) {
  const lang = document.documentElement.lang === 'ja' ? 'ja' : 'en';
  const t = STRINGS[lang];
  const $ = (id) => document.getElementById(id);
  const say = (text) => { $('status').textContent = text; };
  const form = $('form');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    // Turnstile puts its token in this hidden field of the form once the check passes
    const token = form.elements['cf-turnstile-response']?.value ?? '';
    if (!token) return say(t.noToken);

    const send = $('send');
    send.disabled = true;
    say(t.sending);
    let answer = 'failed';
    try {
      const res = await fetch('/api/license/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, lang, turnstile: token }),
      });
      answer = ANSWERS[res.status] ?? 'failed';
    } catch {
      // offline: answer stays 'failed'
    }
    // A token works only once, so the next send needs a new check
    turnstile()?.reset();
    send.disabled = false;
    say(t[answer]);
  });
}

if (typeof document !== 'undefined') {
  run({ document, fetch: fetch.bind(globalThis), turnstile: () => globalThis.turnstile });
}
