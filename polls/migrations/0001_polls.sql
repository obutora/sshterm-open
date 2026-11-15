-- SSH Term's polls (アンケート, ADR 0024). Nothing here names a person, a
-- device or an IP address: an answer is the hash of the poll's id and the
-- app's token for that poll, the choice and the free text, and only until the
-- deadline.

-- A poll that has had an answer: its deadline (ms since the epoch, from
-- polls/polls.json) and when the deadline processing ran (NULL before).
CREATE TABLE polls (
  id TEXT PRIMARY KEY,
  closes_at INTEGER NOT NULL,
  closed_at INTEGER
);

-- One answer per token until the deadline; sending again replaces it. No
-- rowid, so nothing records the order the answers came in.
CREATE TABLE votes (
  poll_id TEXT NOT NULL REFERENCES polls (id),
  token_hash TEXT NOT NULL,
  choice INTEGER NOT NULL,
  free_text TEXT,
  PRIMARY KEY (poll_id, token_hash)
) WITHOUT ROWID;

-- The count of each choice, from the deadline on (the published results).
CREATE TABLE tallies (
  poll_id TEXT NOT NULL REFERENCES polls (id),
  choice INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (poll_id, choice)
) WITHOUT ROWID;

-- Free text from the deadline on, tied only to the poll; deleted 90 days
-- after the deadline. Only the developer reads it (wrangler d1, README).
CREATE TABLE free_texts (
  poll_id TEXT NOT NULL REFERENCES polls (id),
  text TEXT NOT NULL
);
CREATE INDEX free_texts_by_poll ON free_texts (poll_id);
