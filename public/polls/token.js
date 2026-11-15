// The token the app makes for one poll (ADR 0024): 32 random bytes as
// base64url without padding. The poll pages (polls.js) and the Functions
// (polls/rules.js) both import it.

export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
