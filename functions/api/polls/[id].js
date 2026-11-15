// /api/polls/<id>: the polls' API (polls/api.js) as a Cloudflare Pages
// Function, on the D1 binding POLLS_DB. The polls come from the definition as
// it was deployed with this build.

import definition from '../../../polls/polls.json' with { type: 'json' };
import { handlePoll } from '../../../polls/api.js';
import { pollsOf } from '../../../polls/rules.js';

const polls = pollsOf(definition);

export function onRequest({ request, env, params }) {
  return handlePoll({ request, db: env.POLLS_DB, polls, id: params.id, now: Date.now() });
}
