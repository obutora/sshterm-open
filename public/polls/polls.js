// The polls' pages (アンケート, ADR 0024): /polls/<id> and the list /polls/.
//
// A poll's page answers only when its URL carries #k=<token> (the app opens
// it so, with a token it made for this poll); without one it only shows. The
// fragment never reaches the server: the page sends the token, the choice and
// the free text to the Functions on the same origin (POST /api/polls/<id>).
// Sending again with the same token replaces the answer, until the deadline.
// Until the deadline the page shows no count; after it, it fetches the
// results (GET /api/polls/<id>). It stores nothing, and puts every text in
// with textContent.
//
// The frame is in English or Japanese; the poll's own texts are in the app's
// six languages, English standing in for a missing one.

import { localize, pickLang } from '../common.js';

/** The token the app makes: 32 random bytes as base64url without padding. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const STRINGS = {
  en: {
    htmlLang: 'en',
    polls: 'Polls',
    poll: 'Poll',
    list: 'All polls',
    listTitle: 'SSH Term polls',
    listLede: 'Questions from the developer of SSH Term. Answer from the app; the results are published here after each deadline.',
    description: 'A poll from the developer of SSH Term. Answer from the app; the results are published here after the deadline.',
    openNow: 'Open now',
    pastResults: 'Results',
    noneOpen: 'No poll is open now.',
    noResults: 'No results yet.',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    deadline: 'Deadline',
    choose: 'Choose one',
    freeNote: 'Only the developer reads this. Do not write names, host names, IP addresses or the like.',
    send: 'Send',
    sendAgain: 'Send again',
    pending: 'The results will be published here after the deadline.',
    results: 'Results',
    announcement: 'Announcement',
    noscript: 'Turn on JavaScript to answer or to see the results.',
    noToken: 'To answer, open this poll from the SSH Term app. You can only read it here.',
    chooseOne: 'Choose one of the answers.',
    sending: 'Sending…',
    sent: 'Thank you. Your answer is in. Until the deadline you can change it by sending again.',
    closed: 'This poll has closed.',
    freeTextBad: 'The text cannot be sent: it is too long or holds characters that are not allowed.',
    tooMany: 'Too many tries. Wait a moment and send again.',
    failed: 'Could not send your answer. Try again in a moment.',
    resultsFailed: 'Could not load the results. Reload this page in a moment.',
    total: 'Answers: {n}',
  },
  ja: {
    htmlLang: 'ja',
    polls: 'アンケート',
    poll: 'アンケート',
    list: 'アンケートの一覧',
    listTitle: 'SSH Term のアンケート',
    listLede: 'SSH Term の開発者からのアンケートです。アプリから答えられます。結果は締め切りのあと、ここで公開します。',
    description: 'SSH Term の開発者からのアンケートです。アプリから答えられます。結果は締め切りのあと、ここで公開します。',
    openNow: '受付中',
    pastResults: '結果',
    noneOpen: 'いま受け付けているアンケートはありません。',
    noResults: 'まだ結果はありません。',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    deadline: '締め切り',
    choose: '1 つ選んでください',
    freeNote: '開発者だけが読みます。名前・ホスト名・IP アドレスなどは書かないでください。',
    send: '送る',
    sendAgain: 'もう一度送る',
    pending: '締め切りのあと、ここで公開します。',
    results: '結果',
    announcement: 'お知らせ',
    noscript: '答えるとき・結果を見るときは、JavaScript をオンにしてください。',
    noToken: '答えるときは、SSH Term のアプリからこのアンケートを開いてください。ここでは読むだけです。',
    chooseOne: '答えを 1 つ選んでください。',
    sending: '送っています…',
    sent: 'ありがとうございます。答えを受け取りました。締め切りまでは、送り直せば答えを変えられます。',
    closed: 'このアンケートは締め切りました。',
    freeTextBad: '長すぎるか、使えない文字が入っているため、この文章は送れません。',
    tooMany: '送る回数が多すぎます。少し待ってから送ってください。',
    failed: '答えを送れませんでした。少し待ってからもう一度送ってください。',
    resultsFailed: '結果を読み込めませんでした。少し待ってから、このページを読み込み直してください。',
    total: '答えた数: {n}',
  },
};

/** The frame's strings for a BCP 47 tag: Japanese for ja, English otherwise. */
export const frameOf = (tag) => STRINGS[pickLang(tag, STRINGS) === 'ja' ? 'ja' : 'en'];

/** The token in [hash] (#k=<token>, once, well formed), or null. Other keys are dropped. */
export function tokenFrom(hash) {
  const tokens = new URLSearchParams(String(hash).replace(/^#/, '')).getAll('k');
  return tokens.length === 1 && TOKEN.test(tokens[0]) ? tokens[0] : null;
}

/** [texts]' text in the reader's language ([tag]), English when it has none: [lang, text]. */
export function textIn(texts, tag) {
  const lang = pickLang(tag, texts);
  return Object.hasOwn(texts, lang) ? [lang, texts[lang]] : ['en', texts.en];
}

/** BCP 47 for a key of the definition's texts. */
const bcp47 = (lang) => ({ zh: 'zh-Hans', zh_Hant: 'zh-Hant' })[lang] ?? lang;

function put(el, texts, tag) {
  if (!el) return;
  const [lang, text] = textIn(texts, tag);
  el.textContent = text;
  el.lang = bcp47(lang);
}

function readData(document) {
  return JSON.parse(document.getElementById('poll-data').textContent);
}

/** A poll's page. */
export async function runPoll({ document, location, navigator, fetch, now = Date.now }) {
  const $ = (id) => document.getElementById(id);
  const tag = navigator.language;
  const t = frameOf(tag);
  localize(t, document);
  const data = readData(document);
  put($('title'), data.title, tag);
  document.title = `${textIn(data.title, tag)[1]} · SSH Term`;
  for (const [i, option] of data.options.entries()) put(document.querySelector(`[data-option="${i}"]`), option, tag);
  if (data.freeText) put($('free-label'), data.freeText.label, tag);
  if (data.announcement) {
    put($('announcement-title'), data.announcement.title, tag);
    put($('announcement-body'), data.announcement.body, tag);
  }
  const closesAt = Date.parse(data.closesAt);
  $('closes').textContent = new Date(closesAt).toLocaleString(t.htmlLang, { dateStyle: 'medium', timeStyle: 'short' });
  const say = (text) => { $('status').textContent = text; };
  const api = `/api/polls/${encodeURIComponent(data.id)}`;

  const showResults = async () => {
    $('answer').hidden = true;
    $('pending').hidden = true;
    let body;
    try {
      const res = await fetch(api, { headers: { accept: 'application/json' } });
      body = res.ok ? await res.json() : null;
    } catch {
      body = null;
    }
    const counts = body?.state === 'closed' ? body.counts : null;
    if (!Array.isArray(counts) || counts.length !== data.options.length || !counts.every((n) => Number.isInteger(n) && n >= 0)) {
      return say(t.resultsFailed);
    }
    const total = counts.reduce((a, b) => a + b, 0);
    const list = $('counts');
    list.textContent = '';
    for (const [i, count] of counts.entries()) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'option';
      put(name, data.options[i], tag);
      const figure = document.createElement('span');
      figure.className = 'count';
      figure.textContent = `${count} (${total ? Math.round((count / total) * 100) : 0}%)`;
      const meter = document.createElement('meter');
      meter.min = 0;
      meter.max = Math.max(total, 1);
      meter.value = count;
      item.append(name, figure, meter);
      list.append(item);
    }
    $('total').textContent = t.total.replace('{n}', String(total));
    $('results').hidden = false;
    const announcement = $('announcement');
    if (announcement) announcement.hidden = false;
    say(t.closed);
  };

  if (now() >= closesAt) return showResults();

  $('pending').hidden = false;
  const token = tokenFrom(location.hash);
  if (!token) return say(t.noToken);

  $('answer').hidden = false;
  const form = $('form');
  const send = $('send');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const picked = form.querySelector('input[name="choice"]:checked');
    if (!picked) return say(t.chooseOne);
    const answer = { token, choice: Number(picked.value) };
    if (data.freeText) answer.freeText = $('free').value;
    send.disabled = true;
    say(t.sending);
    let res;
    try {
      res = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(answer),
      });
    } catch {
      res = null;
    }
    send.disabled = false;
    if (res?.ok) {
      send.textContent = t.sendAgain;
      return say(t.sent);
    }
    if (res?.status === 409) return showResults();
    if (res?.status === 429) return say(t.tooMany);
    if (res?.status === 400 && data.freeText) {
      const body = await res.json().catch(() => null);
      if (body?.error === 'freeText') return say(t.freeTextBad);
    }
    return say(t.failed);
  });
}

/** The list of polls. */
export function runList({ document, navigator }) {
  const tag = navigator.language;
  localize(frameOf(tag), document);
  const { titles } = readData(document);
  for (const el of document.querySelectorAll('[data-poll]')) {
    const texts = titles[el.dataset.poll];
    if (texts) put(el, texts, tag);
  }
  for (const el of document.querySelectorAll('time')) {
    el.textContent = new Date(el.dateTime).toLocaleDateString(frameOf(tag).htmlLang, { dateStyle: 'medium' });
  }
}

if (typeof document !== 'undefined') {
  const env = { document, location, navigator, fetch: fetch.bind(globalThis) };
  if (document.body.dataset.page === 'poll') runPoll(env);
  else if (document.body.dataset.page === 'list') runList(env);
}
