// The rules of SSH Term's polls (アンケート, ADR 0024): the definition file
// (polls/polls.json), the answers the Functions take and the token the app
// makes. Pure functions with no DOM and no Node APIs: the build, the Pages
// Functions and the cron Worker all import it. The JSON Schemas in
// polls/schema/ say the same rules for editors and the build; this module is
// what the Functions trust.

import { checkThemeText, isForbiddenCodePoint, themeText } from '../public/theme-format.js';

export const SITE = 'https://sshterm.iru-yo.com';
/** The app's languages; every text must have `en`, which stands in for a missing one. */
export const LANGS = ['en', 'ja', 'ko', 'vi', 'zh', 'zh_Hant'];
/** The most code points of each text, once trimmed. */
export const LIMITS = {
  title: 60,
  option: 40,
  freeTextLabel: 80,
  announcementTitle: 40,
  announcementBody: 300,
};
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;
export const FREE_TEXT_DEFAULT = 500;
export const FREE_TEXT_MAX = 1000;
export const DAY = 24 * 60 * 60 * 1000;
/** A poll is open this long when the definition gives no deadline. */
export const OPEN_DAYS = 14;
/** current.json shows a poll's results this long after its deadline. */
export const RESULTS_DAYS = 14;
/** An announcement is shown this long from its poll's deadline (the results) when the definition gives no end. */
export const ANNOUNCEMENT_DAYS = 30;
/** Free text is deleted this long after the poll's deadline. */
export const FREE_TEXT_DAYS = 90;
/**
 * The only hosts an announcement may link to (https only), as the app has
 * them. The one list: the JSON Schemas leave the hosts to these rules.
 */
export const LINK_HOSTS = ['discord.gg', 'discord.com', 'sshterm.iru-yo.com', 'github.com'];
export const LINK_MAX = 500;

const POLL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLL_ID_MAX = 40;
/** Ids whose page would clash with the list's. */
const RESERVED_IDS = ['index'];
/** ISO 8601 with seconds or not, no fractions, and a zone. */
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;
/** https, one of LINK_HOSTS exactly (no userinfo, port or trailing dot), then a path, query or fragment. */
const LINK = new RegExp(`^https://(?:${LINK_HOSTS.map((h) => h.replaceAll('.', '\\.')).join('|')})(?:[/?#]\\S*)?$`);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The URL of a poll's page (answers with #k=<token>, results after the deadline). */
export const pollUrl = (id) => `${SITE}/polls/${id}`;

/** [ms] as the polls write times (current.json, the API, the pages): UTC, to the second. */
export const isoTime = (ms) => new Date(ms).toISOString().slice(0, 19) + 'Z';

/** [time] (ISO 8601 with a zone) in ms since the epoch, or null. */
function parseTime(time) {
  if (typeof time !== 'string' || !TIME.test(time)) return null;
  const ms = Date.parse(time);
  if (Number.isNaN(ms)) return null;
  // Date.parse rolls 2026-02-30 over to March; refuse what is not a real day.
  const [y, m, d] = time.slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return null;
  const [hh, mm] = time.slice(11, 16).split(':').map(Number);
  return hh < 24 && mm < 60 ? ms : null;
}

/** True when [link] is https to one of LINK_HOSTS, with nothing between the host and the path. */
export function isAllowedLink(link) {
  if (typeof link !== 'string' || link.length > LINK_MAX || !LINK.test(link)) return false;
  for (const ch of link) if (isForbiddenCodePoint(ch.codePointAt(0))) return false;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && LINK_HOSTS.includes(url.hostname) && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

/**
 * Checks a definition file's document. Returns {ok: true, polls} (each poll
 * with its defaults filled in, texts trimmed and times in ms) or {ok: false,
 * problems: [{path, rule}]} with every problem found.
 */
export function checkDefinition(doc) {
  const problems = [];
  const fail = (path, rule) => {
    problems.push({ path, rule });
    return undefined;
  };
  const onlyKeys = (map, known, path) => {
    for (const key of Object.keys(map)) {
      if (!known.includes(key)) fail(path ? `${path}.${key}` : key, 'unknownField');
    }
  };
  const need = (map, key, path, ok) => {
    if (!Object.hasOwn(map, key)) return fail(path, 'missingField');
    return ok(map[key]) ? map[key] : fail(path, 'wrongType');
  };
  const langText = (map, key, path, max) => {
    const value = need(map, key, path, isObject);
    if (!value) return undefined;
    onlyKeys(value, LANGS, path);
    if (!Object.hasOwn(value, 'en')) fail(`${path}.en`, 'missingField');
    const kept = {};
    for (const lang of LANGS) {
      if (!Object.hasOwn(value, lang)) continue;
      if (typeof value[lang] !== 'string') {
        fail(`${path}.${lang}`, 'wrongType');
        continue;
      }
      const problem = checkThemeText(value[lang], max);
      if (problem) fail(`${path}.${lang}`, problem);
      else kept[lang] = themeText(value[lang]);
    }
    return kept;
  };
  const time = (map, key, path) => {
    const value = need(map, key, path, (v) => typeof v === 'string');
    if (value === undefined) return undefined;
    return parseTime(value) ?? fail(path, 'badTime');
  };

  if (!isObject(doc)) return { ok: false, problems: [{ path: '', rule: 'wrongType' }] };
  onlyKeys(doc, ['$schema', 'polls'], '');
  if (Object.hasOwn(doc, '$schema') && typeof doc.$schema !== 'string') fail('$schema', 'wrongType');
  const list = need(doc, 'polls', 'polls', Array.isArray) ?? [];

  const polls = [];
  for (const [i, value] of list.entries()) {
    const at = `polls[${i}]`;
    if (!isObject(value)) {
      fail(at, 'wrongType');
      continue;
    }
    const before = problems.length;
    onlyKeys(value, ['id', 'title', 'options', 'freeText', 'opensAt', 'closesAt', 'announcement'], at);
    const id = need(value, 'id', `${at}.id`, (v) => typeof v === 'string');
    if (id !== undefined && (!POLL_ID.test(id) || id.length > POLL_ID_MAX || RESERVED_IDS.includes(id))) {
      fail(`${at}.id`, 'badId');
    }
    const title = langText(value, 'title', `${at}.title`, LIMITS.title);
    const optionList = need(value, 'options', `${at}.options`, Array.isArray);
    let options;
    if (optionList) {
      if (optionList.length < MIN_OPTIONS) fail(`${at}.options`, 'tooFew');
      if (optionList.length > MAX_OPTIONS) fail(`${at}.options`, 'tooMany');
      options = optionList.map((_, j) => langText(optionList, j, `${at}.options[${j}]`, LIMITS.option));
    }
    let freeText = null;
    if (Object.hasOwn(value, 'freeText')) {
      const map = need(value, 'freeText', `${at}.freeText`, isObject);
      if (map) {
        onlyKeys(map, ['label', 'maxLength'], `${at}.freeText`);
        const label = langText(map, 'label', `${at}.freeText.label`, LIMITS.freeTextLabel);
        let maxLength = FREE_TEXT_DEFAULT;
        if (Object.hasOwn(map, 'maxLength')) {
          maxLength = need(map, 'maxLength', `${at}.freeText.maxLength`, Number.isInteger);
          if (maxLength !== undefined && (maxLength < 1 || maxLength > FREE_TEXT_MAX)) {
            fail(`${at}.freeText.maxLength`, 'outOfRange');
          }
        }
        freeText = { label, maxLength };
      }
    }
    const opensAt = time(value, 'opensAt', `${at}.opensAt`);
    let closesAt = opensAt === undefined ? undefined : opensAt + OPEN_DAYS * DAY;
    if (Object.hasOwn(value, 'closesAt')) {
      closesAt = time(value, 'closesAt', `${at}.closesAt`);
      if (closesAt !== undefined && opensAt !== undefined && closesAt <= opensAt) {
        fail(`${at}.closesAt`, 'notAfterOpening');
      }
    }
    let announcement = null;
    if (Object.hasOwn(value, 'announcement')) {
      const map = need(value, 'announcement', `${at}.announcement`, isObject);
      if (map) {
        const path = `${at}.announcement`;
        onlyKeys(map, ['title', 'body', 'link', 'until'], path);
        const aTitle = langText(map, 'title', `${path}.title`, LIMITS.announcementTitle);
        const body = langText(map, 'body', `${path}.body`, LIMITS.announcementBody);
        let link = null;
        if (Object.hasOwn(map, 'link')) {
          link = map.link;
          if (!isAllowedLink(link)) fail(`${path}.link`, 'badLink');
        }
        let until = closesAt === undefined ? undefined : closesAt + ANNOUNCEMENT_DAYS * DAY;
        if (Object.hasOwn(map, 'until')) {
          until = time(map, 'until', `${path}.until`);
          if (until !== undefined && closesAt !== undefined && until <= closesAt) fail(`${path}.until`, 'notAfterDeadline');
        }
        announcement = { title: aTitle, body, link, until };
      }
    }
    if (problems.length > before) continue;

    if (polls.some((p) => p.id === id)) {
      fail(`${at}.id`, 'idTaken');
      continue;
    }
    if (polls.some((p) => opensAt < p.closesAt && p.opensAt < closesAt)) {
      fail(`${at}.opensAt`, 'overlaps');
      continue;
    }
    polls.push({ id, title, options, freeText, opensAt, closesAt, announcement });
  }
  return problems.length ? { ok: false, problems } : { ok: true, polls };
}

/** The polls of a definition that passed its checks (for the Functions); throws otherwise. */
export function pollsOf(doc) {
  const result = checkDefinition(doc);
  if (!result.ok) throw new Error(`polls/polls.json breaks its rules: ${JSON.stringify(result.problems)}`);
  return result.polls;
}

// ── Answers ─────────────────────────────────────────────────────────────────

/**
 * [text] (an answer's free text) as it is kept, or a problem. Kept: without
 * the surrounding spaces, null when nothing is left. Refused: not a string,
 * not well-formed UTF-16 (a lone surrogate), longer than [maxLength] code
 * points once trimmed, or holding a control character or one that turns the
 * direction (line feeds aside: it is a text area). Returns {text} or {problem}.
 */
export function checkFreeText(text, maxLength) {
  if (typeof text !== 'string') return { problem: 'wrongType' };
  if (!text.isWellFormed()) return { problem: 'encoding' };
  const kept = themeText(text);
  let count = 0;
  for (const ch of kept) {
    const cp = ch.codePointAt(0);
    if (cp !== 0x0a && isForbiddenCodePoint(cp)) return { problem: 'forbiddenCharacter' };
    count++;
  }
  if (count > maxLength) return { problem: 'tooLong' };
  return { text: count ? kept : null };
}

/** The hex SHA-256 of a poll's id and a token: the only trace of the token kept, until the deadline. */
export async function tokenHash(pollId, token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pollId}\n${token}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
