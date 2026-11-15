// Poll definitions for the tests. No test depends on the polls the shipped
// polls/polls.json holds: every test builds its own.

export const DAY = 24 * 60 * 60 * 1000;
export const OPENS = '2026-12-01T00:00:00Z';
export const OPENS_MS = Date.parse(OPENS);
/** 14 days after OPENS: the default deadline. */
export const CLOSES_MS = OPENS_MS + 14 * DAY;

/** One poll as the definition holds it; [extra] replaces or adds fields. */
export function poll(extra = {}) {
  return {
    id: 'next-feature',
    title: { en: 'What should SSH Term do next?', ja: 'SSH Term に次に足すものは？' },
    options: [
      { en: 'Port forwarding', ja: 'ポートフォワード' },
      { en: 'SFTP', ja: 'SFTP' },
      { en: 'Themes', ja: 'テーマ' },
    ],
    opensAt: OPENS,
    ...extra,
  };
}

/** A definition file's document holding [polls]. */
export function definition(...polls) {
  return { polls };
}

/** 32 random bytes as base64url without padding: a token as the app makes it. */
export function token(seed = 1) {
  const bytes = new Uint8Array(32).map((_, i) => (seed * 31 + i * 7) & 0xff);
  return Buffer.from(bytes).toString('base64url');
}
