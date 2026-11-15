// The polls' pages (アンケート, ADR 0024): /polls/<id> and the list /polls/.
//
// A poll's page answers only when its URL carries #k=<token> (the app opens
// it so, with a token it made for this poll); without one it only shows. The
// fragment never reaches the server: the page sends the token, the choice and
// the free text to the Functions on the same origin (POST /api/polls/<id>).
// Sending again with the same token replaces the answer, until the deadline.
// Until the deadline the page shows no count. After it, the poll is closed;
// once its results are published (resultsAt in the definition, set when the
// developer has checked the counts) it fetches them (GET /api/polls/<id>),
// until then it says they will come. It stores nothing, and puts every text
// in with textContent.
//
// The frame is in English or Japanese; the poll's own texts are in the app's
// six languages, English standing in for a missing one.

import { localize, pickLang } from '../common.js';
import { TOKEN } from './token.js';

export const STRINGS = {
  en: {
    htmlLang: 'en',
    polls: 'Polls',
    poll: 'Poll',
    list: 'All polls',
    listTitle: 'SSH Term polls',
    listLede: 'Questions from the developer of SSH Term. Answer from the app; the results are published here after each deadline, once the developer has checked them.',
    description: 'A poll from the developer of SSH Term. Answer from the app; the results are published here after the deadline, once the developer has checked them.',
    openNow: 'Open now',
    closedPolls: 'Closed polls',
    noneOpen: 'No poll is open now.',
    noneClosed: 'No poll has closed yet.',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    deadline: 'Deadline',
    choose: 'Choose one',
    freeNote: 'Only the developer reads this. Do not write names, host names, IP addresses or the like.',
    send: 'Send',
    sendAgain: 'Send again',
    pending: 'The results will be published here after the deadline, once the developer has checked them.',
    checking: 'The results will be published here after the developer checks them.',
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
    listLede: 'SSH Term の開発者からのアンケートです。アプリから答えられます。結果は締め切りのあと、開発者が確認してから、ここで公開します。',
    description: 'SSH Term の開発者からのアンケートです。アプリから答えられます。結果は締め切りのあと、開発者が確認してから、ここで公開します。',
    openNow: '受付中',
    closedPolls: '締め切ったアンケート',
    noneOpen: 'いま受け付けているアンケートはありません。',
    noneClosed: 'まだ締め切ったアンケートはありません。',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    deadline: '締め切り',
    choose: '1 つ選んでください',
    freeNote: '開発者だけが読みます。名前・ホスト名・IP アドレスなどは書かないでください。',
    send: '送る',
    sendAgain: 'もう一度送る',
    pending: '締め切りのあと、開発者が確認してから、ここで公開します。',
    checking: '結果は開発者が確認したあと、ここで公開します。',
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

/**
 * The counts in [body] (GET /api/polls/<id>'s) of a closed poll with
 * [optionCount] options, or null: one whole number of 0 or more per option.
 * The build (build/polls.js) reads them the same way.
 */
export function countsIn(body, optionCount) {
  const counts = body?.state === 'closed' ? body.counts : null;
  const ok = Array.isArray(counts) && counts.length === optionCount && counts.every((n) => Number.isInteger(n) && n >= 0);
  return ok ? counts : null;
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
  const frame = frameOf(tag);
  localize(frame, document);
  const poll = readData(document);
  put($('title'), poll.title, tag);
  document.title = `${textIn(poll.title, tag)[1]} · SSH Term`;
  for (const [i, option] of poll.options.entries()) put(document.querySelector(`[data-option="${i}"]`), option, tag);
  if (poll.freeText) put($('free-label'), poll.freeText.label, tag);
  if (poll.announcement) {
    put($('announcement-title'), poll.announcement.title, tag);
    put($('announcement-body'), poll.announcement.body, tag);
  }
  const closesAt = Date.parse(poll.closesAt);
  $('closes').textContent = new Date(closesAt).toLocaleString(frame.htmlLang, { dateStyle: 'medium', timeStyle: 'short' });
  const say = (text) => { $('status').textContent = text; };
  const api = `/api/polls/${encodeURIComponent(poll.id)}`;

  const closed = () => {
    $('answer').hidden = true;
    $('pending').hidden = true;
  };
  /** Closed, the results not yet published: they come once the developer has checked them. */
  const showChecking = () => {
    closed();
    $('checking').hidden = false;
    say(frame.closed);
  };

  const showResults = async () => {
    closed();
    let body;
    try {
      const res = await fetch(api, { headers: { accept: 'application/json' } });
      body = res.ok ? await res.json() : null;
    } catch {
      body = null;
    }
    // Closed without counts: the API has not reached resultsAt yet (this clock is ahead).
    if (body?.state === 'closed' && !Object.hasOwn(body, 'counts')) return showChecking();
    const counts = countsIn(body, poll.options.length);
    if (!counts) return say(frame.resultsFailed);
    const total = counts.reduce((a, b) => a + b, 0);
    const list = $('counts');
    list.textContent = '';
    for (const [i, count] of counts.entries()) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'option';
      put(name, poll.options[i], tag);
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
    $('total').textContent = frame.total.replace('{n}', String(total));
    $('results').hidden = false;
    const announcement = $('announcement');
    if (announcement) announcement.hidden = false;
    say(frame.closed);
  };

  /** After the deadline: the results once published (resultsAt reached), else word that they will come. */
  const afterDeadline = () => (poll.resultsAt !== null && now() >= Date.parse(poll.resultsAt) ? showResults() : showChecking());

  if (now() >= closesAt) return afterDeadline();

  $('pending').hidden = false;
  const token = tokenFrom(location.hash);
  if (!token) return say(frame.noToken);

  $('answer').hidden = false;
  const form = $('form');
  const send = $('send');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const picked = form.querySelector('input[name="choice"]:checked');
    if (!picked) return say(frame.chooseOne);
    const answer = { token, choice: Number(picked.value) };
    if (poll.freeText) answer.freeText = $('free').value;
    send.disabled = true;
    say(frame.sending);
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
      send.textContent = frame.sendAgain;
      return say(frame.sent);
    }
    // The deadline overtook the send: the API says whether the results are out yet (this clock may be behind).
    if (res?.status === 409) return poll.resultsAt === null ? showChecking() : showResults();
    if (res?.status === 429) return say(frame.tooMany);
    if (res?.status === 400 && poll.freeText) {
      const body = await res.json().catch(() => null);
      if (body?.error === 'freeText') return say(frame.freeTextBad);
    }
    return say(frame.failed);
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
