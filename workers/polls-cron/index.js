// sshterm-polls-cron: the polls' clock (ADR 0024). Pages Functions run only
// when someone calls them, so this Worker, on the same D1 database, runs
// every hour whether or not anyone visits the site:
//
//   1. the deadline processing of every poll whose deadline has passed
//      (counts to tallies, every answer's row deleted);
//   2. free text deleted 90 days after its poll's deadline;
//   3. when /polls/current.json says it is due to change (nextChangeAt has
//      passed: a poll opened or closed, results or an announcement started or
//      ended), the Pages deploy hook, so the site is built again.

import { closeDue, purgeFreeText } from '../../polls/store.js';

/** One run at [now]. Resolves to what it did. */
export async function runCron({ db, now, fetch, site, deployHook }) {
  const closed = await closeDue(db, now);
  const purged = await purgeFreeText(db, now);
  let rebuilt = false;
  if (deployHook) {
    const res = await fetch(`${site}/polls/current.json`, { headers: { 'cache-control': 'no-cache' } });
    const doc = res.ok ? await res.json().catch(() => null) : null;
    const next = Date.parse(doc?.nextChangeAt);
    if (next <= now) {
      const hook = await fetch(deployHook, { method: 'POST' });
      if (!hook.ok) throw new Error(`the deploy hook answered ${hook.status}`);
      rebuilt = true;
    }
  }
  return { closed, purged, rebuilt };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCron({
      db: env.POLLS_DB,
      now: controller.scheduledTime,
      fetch: globalThis.fetch.bind(globalThis),
      site: env.SITE,
      deployHook: env.PAGES_DEPLOY_HOOK,
    }));
  },
};
