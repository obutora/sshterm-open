// The polls' API, served by the Pages Functions at /api/polls/<id>
// (functions/api/polls/[id].js) on the D1 database of polls/store.js.
//
//   GET   {id, state: "open", closesAt} until the deadline: no count, ever;
//         {id, state: "closed", closesAt, total, counts} after it (closing
//         the poll first if the cron Worker has not yet).
//   POST  {token, choice, freeText?}: stores the token's answer, replacing
//         its earlier one, until the deadline (409 after it).
//
// A poll is known only from its start. Nothing about the request but its
// body is read: no IP address, no user agent, no cookie.

import { TOKEN, checkFreeText, tokenHash } from './rules.js';
import { closePoll, countsOf, vote } from './store.js';

/** The largest body taken, in bytes: 1000 code points of 4 bytes, escaped, and the rest. */
const MAX_BODY = 16 * 1024;
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + 'Z';

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const refuse = (error, extra = {}) => json(400, { error, ...extra });

async function readAnswer(request) {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return { response: json(415, { error: 'contentType' }) };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BODY) return { response: json(413, { error: 'tooLarge' }) };
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { response: refuse('encoding') };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { response: refuse('json') };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((k) => !['token', 'choice', 'freeText'].includes(k))) {
    return { response: refuse('json') };
  }
  return { body };
}

async function answer(request, db, poll) {
  const { body, response } = await readAnswer(request);
  if (response) return response;
  if (typeof body.token !== 'string' || !TOKEN.test(body.token)) return refuse('token');
  const { choice } = body;
  if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) return refuse('choice');
  let freeText = null;
  if (body.freeText !== undefined) {
    if (!poll.freeText) return refuse('freeText', { problem: 'notAsked' });
    const checked = checkFreeText(body.freeText, poll.freeText.maxLength);
    if (checked.problem) return refuse('freeText', { problem: checked.problem });
    freeText = checked.text;
  }
  const stored = await vote(db, { poll, hash: await tokenHash(poll.id, body.token), choice, freeText });
  if (!stored) return json(409, { error: 'closed' });
  return json(200, { ok: true, closesAt: iso(poll.closesAt) });
}

/** The response to [request] for the poll [id] of [polls] at [now], on the D1 binding [db]. */
export async function handlePoll({ request, db, polls, id, now }) {
  const poll = polls.find((p) => p.id === id && p.opensAt <= now);
  if (!poll) return json(404, { error: 'notFound' });
  const open = now < poll.closesAt;
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (open) return json(200, { id: poll.id, state: 'open', closesAt: iso(poll.closesAt) });
    await closePoll(db, poll, now);
    const counts = await countsOf(db, poll.id, poll.options.length);
    return json(200, {
      id: poll.id, state: 'closed', closesAt: iso(poll.closesAt), total: counts.reduce((a, b) => a + b, 0), counts,
    });
  }
  if (request.method === 'POST') {
    if (!open) return json(409, { error: 'closed' });
    return answer(request, db, poll);
  }
  return json(405, { error: 'method' }, { allow: 'GET, HEAD, POST' });
}
