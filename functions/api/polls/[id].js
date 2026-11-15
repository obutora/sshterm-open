// /api/polls/<id>: the polls' API (polls/api.js) as a Cloudflare Pages
// Function, on the D1 binding POLLS_DB. The polls come from the definition as
// it was deployed with this build.

import definition from '../../../polls/polls.json' with { type: 'json' };
import { pagesFunction } from '../../../polls/api.js';
import { pollsOf } from '../../../polls/rules.js';

export const onRequest = pagesFunction(pollsOf(definition));
