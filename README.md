# sshterm-open

The **open page** of [SSH Term](https://apps.apple.com/app/id6759213045):
`https://sshterm.iru-yo.com/open#h=<host_id>&s=<session id>`.

Push notifications that SSH Term's host agent (stagent) sends to Slack,
Discord, Telegram or a generic webhook link here, because those services only
accept https links. The page hands the link to the app as
`sshtermx://open?h=<host_id>[&s=<session id>]`. This repository is public so
anyone can read what happens to the part after `#`.

## What the page does

- `h` and `s` are in the URL fragment (`#…`), which browsers never send to
  the server, nor to link-preview crawlers.
- The page reads only `h` (32 lowercase hex, the host's `host_id`) and `s`
  (16 lowercase hex, a session ID; optional). Other keys are dropped. If `h`
  is missing, or `h` or `s` is malformed or repeated, it opens nothing.
- On iOS and Android it redirects at once with `location.replace`, except in
  an Android app's own WebView (`; wv)` in the user agent), where a redirect
  to a custom scheme replaces the page with an error page.
- On a computer it doesn't redirect; it says the link opens on a phone.
- An "Open in SSH Term" button with the same link is always there. If the
  page hasn't been left about 2 seconds after the redirect (no `blur` or
  `visibilitychange`), or in an Android WebView, it shows what to do when the
  app doesn't open, and the store links.
- It never shows `h` or `s`, stores nothing, and loads nothing but its own
  `open.js` and `open.css`: no fonts, analytics or CDN. `_headers` sets the
  CSP, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.
- Languages follow `navigator.language`: English, Japanese, Korean,
  Simplified and Traditional Chinese, the same as the app. Others get
  English.

The URL and the `#h=…&s=…` form never change: links stay in the services'
message history.

## Layout

- `public/`: the site, deployed as is to Cloudflare Pages (no build step;
  output directory `public`). `/open` serves `open.html`.
- `test/`: `npm test` (Node 22+) checks the link, platform and language
  rules in `public/open.js`.
