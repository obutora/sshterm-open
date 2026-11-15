// The polls' D1 database (polls/migrations/): answers until the deadline,
// counts and free text after it. The Pages Functions (polls/api.js) and the
// cron Worker (workers/polls-cron/) share it. Every value goes in with bind:
// no SQL here is ever built from a value.

import { DAY, FREE_TEXT_DAYS } from './rules.js';

/** SQL true while the poll ?1 has not been through its deadline processing. */
const POLL_NOT_CLOSED = 'EXISTS (SELECT 1 FROM polls WHERE id = ?1 AND closed_at IS NULL)';

/** The statement that records [poll] with its deadline from the definition, until it is closed. */
function recordPoll(db, poll) {
  return db.prepare(
    `INSERT INTO polls (id, closes_at) VALUES (?1, ?2)
     ON CONFLICT (id) DO UPDATE SET closes_at = excluded.closes_at WHERE polls.closed_at IS NULL`,
  ).bind(poll.id, poll.closesAt);
}

/**
 * Stores an answer to [poll] for the token whose hash is [hash], replacing
 * the token's earlier answer. False when the poll's deadline processing has
 * already run (nothing is stored).
 */
export async function vote(db, { poll, hash, choice, freeText }) {
  const [, stored] = await db.batch([
    recordPoll(db, poll),
    db.prepare(
      `INSERT INTO votes (poll_id, token_hash, choice, free_text)
       SELECT ?1, ?2, ?3, ?4 WHERE ${POLL_NOT_CLOSED}
       ON CONFLICT (poll_id, token_hash) DO UPDATE SET choice = excluded.choice, free_text = excluded.free_text`,
    ).bind(poll.id, hash, choice, freeText),
  ]);
  return stored.meta.changes === 1;
}

/** The statements that close one poll ([id]) at [now]: they do nothing once it is closed. */
function closeStatements(db, id, now) {
  return [
    db.prepare(
      `INSERT INTO tallies (poll_id, choice, count)
       SELECT poll_id, choice, COUNT(*) FROM votes WHERE poll_id = ?1 AND ${POLL_NOT_CLOSED} GROUP BY choice`,
    ).bind(id),
    // Ordered by the hash, which is random: the order says nothing of who or when.
    db.prepare(
      `INSERT INTO free_texts (poll_id, text)
       SELECT poll_id, free_text FROM votes WHERE poll_id = ?1 AND free_text IS NOT NULL AND ${POLL_NOT_CLOSED}
       ORDER BY token_hash`,
    ).bind(id),
    db.prepare('DELETE FROM votes WHERE poll_id = ?1').bind(id),
    db.prepare('UPDATE polls SET closed_at = ?2 WHERE id = ?1 AND closed_at IS NULL').bind(id, now),
  ];
}

/** True once [pollId] has been through its deadline processing. */
export async function isClosed(db, pollId) {
  return (await db.prepare('SELECT closed_at FROM polls WHERE id = ?1').bind(pollId).first('closed_at')) != null;
}

/**
 * The deadline processing of [poll] (its deadline from the definition) at
 * [now]: its counts go to tallies, its free text to free_texts with only the
 * poll's id, and every answer's row (the token's hash, the choice) is deleted.
 * A poll nobody answered is recorded as closed too.
 */
export async function closePoll(db, poll, now) {
  await db.batch([recordPoll(db, poll), ...closeStatements(db, poll.id, now)]);
}

/** The deadline processing of every poll whose deadline is past at [now]. Resolves to their ids. */
export async function closeDue(db, now) {
  const { results } = await db.prepare('SELECT id FROM polls WHERE closed_at IS NULL AND closes_at <= ?1').bind(now).all();
  const ids = results.map((r) => r.id);
  if (ids.length) await db.batch(ids.flatMap((id) => closeStatements(db, id, now)));
  return ids;
}

/** The counts of a closed poll by choice, [optionCount] long. */
export async function countsOf(db, pollId, optionCount) {
  const { results } = await db.prepare('SELECT choice, count FROM tallies WHERE poll_id = ?1').bind(pollId).all();
  const counts = Array(optionCount).fill(0);
  for (const { choice, count } of results) if (choice >= 0 && choice < optionCount) counts[choice] = count;
  return counts;
}

/** Deletes the free text of polls whose deadline was 90 days or more before [now]. Resolves to the rows deleted. */
export async function purgeFreeText(db, now) {
  const { meta } = await db.prepare(
    'DELETE FROM free_texts WHERE poll_id IN (SELECT id FROM polls WHERE closes_at <= ?1)',
  ).bind(now - FREE_TEXT_DAYS * DAY).run();
  return meta.changes;
}
