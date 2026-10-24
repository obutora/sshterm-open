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
  page isn't hidden after keeping focus for about 2 seconds after the
  redirect, or in an Android WebView, it shows what to do when the app
  doesn't open, and the store links. The wait pauses while the page is
  blurred, as it is under iOS's "Open in SSH Term?" prompt.
- It never shows `h` or `s`, stores nothing, and loads nothing but its own
  `open.js`, `common.js` and `open.css`: no fonts, analytics or CDN. `_headers` sets the
  CSP, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.
- Languages follow `navigator.language`: English, Japanese, Korean,
  Simplified and Traditional Chinese, the same as the app. Others get
  English.

The URL and the `#h=…&s=…` form never change: links stay in the services'
message history.

## The store link

`https://sshterm.iru-yo.com/app` is the one link to share (on X and
elsewhere) for installing SSH Term. On iOS it goes at once to the App Store,
on Android to Google Play; on a computer it shows both. Its `og:` and
`twitter:` tags give link previews a card with the app icon.

`?utm_source=…&utm_medium=…&utm_campaign=…` is passed to Google Play as it
is; `utm_campaign` (up to 40 characters) is also the App Store's campaign
token `ct`. Other keys are dropped.

## The theme format

`https://sshterm.iru-yo.com/themes/format` explains SSH Term's theme file
(format v1) for people who write themes by hand or convert them with their
own tools: the fields, colours and how missing ones are filled, the rules,
licences, theme links and a Windows Terminal / iTerm2 mapping, in the five
languages. `https://sshterm.iru-yo.com/themes/schema/v1.json` is its JSON
Schema (2020-12), served as `application/schema+json` with
`Access-Control-Allow-Origin: *` so editors can fetch it from `$schema`.

The schema says every rule but three, which a checker adds in code: a file
is at most 64 KB, names and authors are 1–40 code points once trimmed (the
schema counts untrimmed), and the IDs of a file's themes differ. Their URLs
and contents never change once published; a later format gets `v2.json`.

`test/fixtures/theme_format/` is a copy of the app's examples, with their
`manifest.json`; copy them again when the app's examples change.

## The theme page

`https://sshterm.iru-yo.com/theme#t=<theme>` shows one SSH Term theme that
someone sent as a link (SSH Term's テーマのリンク, ⋯ › Export › Copy Link or
QR Code).

- `t` is one theme's document (format v1, `ssh-term-theme`), compressed with
  deflate-raw and encoded as base64url without padding. It is in the
  fragment, so it never reaches the server. The page reads only `t`; other
  keys are dropped. A missing, repeated or non-base64url `t` shows a
  broken-link line and nothing else.
- It inflates `t` with `DecompressionStream('deflate-raw')`, counting as it
  goes, and stops past 64KB. The document must hold exactly one theme and
  pass the app's rules (`theme-format.js`); otherwise only the broken-link
  line shows: no 見本 and no button.
- The 見本 is a terminal (a prompt, `ls`, `git diff`, a status line, the
  selection and the cursor) drawn in the theme's colours, every one of the
  16 ANSI colours in its text, and a key of the 16 colours numbered 00–15
  with their values. The whole page is printed in the theme: its background
  is the paper, its foreground the ink. With the 見本 come the name, author,
  licence and the theme it was based on. Text goes in with `textContent`
  only.
- An "Open in SSH Term" button opens `sshtermx://theme?t=<the same t>`, where
  the app shows its import screen. The page never goes there by itself, on
  any device. If the page is still in front about 2 seconds after the tap,
  or in an Android WebView, it shows help and the store links as `/open`
  does. On a computer it says to open the link on a phone.
- Languages, the CSP, `noindex` and `no-referrer` are the same as `/open`
  (the `/*` block of `_headers`); it loads only its own `theme.js`,
  `theme-format.js`, `common.js`, `sheet.css` and `theme.css`.

`public/theme-format.js` holds the format v1 rules as the app has them
(`validateThemeDocument`, `validateThemeBytes`, `decodeThemeLink`,
`encodeThemeLink`, the text and colour rules), with no DOM, for the browser
and Node alike. `test/fixtures/theme_format/` is a copy of the app's
fixtures and `test/fixtures/theme-link.txt` a link the app made; the tests
check that both sides agree.

## The theme gallery

`https://sshterm.iru-yo.com/themes/` lists the themes people sent to
[obutora/sshterm-themes](https://github.com/obutora/sshterm-themes), the
gallery's repository where each theme is reviewed as a pull request.
`npm run build` makes the pages from that repository's `main`; Cloudflare
Pages runs it on every deploy, and sshterm-themes calls a deploy hook when
its `main` changes.

- The build clones the repository with its whole history (`THEMES_REPO`, a
  URL or path, default `https://github.com/obutora/sshterm-themes.git`;
  `THEMES_REF`, default `main`) and checks every file under `themes/` again:
  `themes/<GitHub login>/<id>.json`, one theme the app reads
  (`theme-format.js`), named after its id, its foreground at 4.5:1 or more
  on its background (WCAG 2 contrast); no id twice, and no name twice
  (compared after NFKC, ignoring case). One broken file fails the build with
  a JSON line per problem and writes nothing, so nothing is published. The
  id pattern, the name comparison and the contrast are `theme-format.js`'s,
  which sshterm-themes' check vendors. Unlike that check, the build does not
  run the JSON Schema (ajv): `validateThemeBytes` already holds every rule
  the schema has.
- The list (`/themes/`) shows each theme as a plate painted in its colours:
  its 見本, its 16 colours, name, author and licence; every third plate, from
  the first, is large. The plates come in the order the themes came to
  `main` (the commit on `main` that first added the file; a moved file keeps
  its date). Its own JS filters by
  name and by a dark or light background: dark is a background whose
  relative luminance is under √(1.05 × 0.05) − 0.05 ≈ 0.179, where white
  and black text contrast equally. That splits the app's 16 presets 8 and 8.
- Each theme's page (`/themes/<id>/`) is printed in the theme. It has the
  large 見本 with its 16 colours numbered 00–15, the name, the author,
  licence, the theme it was based on, the GitHub account that sent it
  (`https://github.com/<login>`, apart from the author the theme names), an
  "Open in SSH Term" button with the theme's link (`/theme#t=…`), the same
  link as a QR code (an SVG made by the build), and the theme's file.
- The pages are in English; `public/themes/gallery.js` puts them in the
  reader's language (the five of `/open`). Names and authors are never
  translated, and every text goes into the HTML escaped. Colours come from
  the build's `colors.css` files as custom properties: the pages load only
  the site's own JS, CSS and SVG, and its icon.
- `/themes/sitemap.xml` lists the gallery, and `robots.txt` points to it.
  `_headers` removes `X-Robots-Tag: noindex` from `/themes` and `/themes/*`
  only; the CSP is the same as everywhere.
- A theme taken down from sshterm-themes leaves the site at the next build.
  Themes already imported and theme links already shared stay: a link
  carries the whole theme. The list says so; each theme's page links to how
  to send a theme and to asking for a take-down.

The build's output (`public/themes/index.html`, `colors.css`,
`sitemap.xml` and one directory per theme) is not committed.

## Layout

- `public/`: the site, deployed to Cloudflare Pages (build command
  `npm run build`, output directory `public`). `/open` serves `open.html`,
  `/app` serves `app.html`, `/theme` serves `theme.html`. `common.js` holds
  what the pages share: the platform by user agent, the language and filling
  in the strings. `sheet.css` is the look the theme pages share (`/theme`,
  the gallery and the format page): the paper, the rules, the type, the
  button and the 見本.
- Versions: the zone lets browsers keep `.css`, `.js`, `.png` and `.svg` for
  4 hours without asking (a lower `Cache-Control` from Pages cannot shorten
  it), while pages are asked for every time. So on Pages (`CF_PAGES` set)
  `npm run build` ends with `build/stamp.js`: every page's root-relative
  link to those files and every module's relative import gets
  `?v=<hash of the file as served>`, a module's hash covering its imports'.
  A changed file gets a new URL and the browser loads it; an unchanged one
  keeps its URL and stays cached. It rewrites `public/` in place, so a local
  `npm run build` skips it; a link to a missing file fails the build.
- `test/`: `npm test` (Node 22+) checks the link, platform and language
  rules in `public/open.js` and `public/common.js`, and the store URLs in
  `public/app.js`; the theme page and `public/theme-format.js` (with
  `test/fake-dom.js`, a minimal stand-in for the page's DOM).
- `public/themes/`: `/themes/format` serves `format.html` (with `format.js`
  and `format.css`); `schema/v1.json` is the schema and `example.json` the
  example file shown on the page. `gallery.js` and `gallery.css` are the
  gallery's.
- `build/`: the gallery's build (`gallery.js`), the links' versions
  (`stamp.js`); `main.js` is `npm run build`.
- `test/theme-schema.test.js` replays the app's examples against the schema
  (skipping those the manifest marks `not-expressible`);
  `test/theme-format-page.test.js` checks the page's strings, that it loads
  only its own files, its example and theme-link code, and the schema's
  headers. Both use `ajv` (`npm install` first).
- `test/gallery-build.test.js` builds throwaway git repositories
  (`test/themes-repo.js`) into a temporary `public/`;
  `test/gallery-rules.test.js` checks the rules one by one;
  `test/gallery-page.test.js` the strings, the filters and `_headers` as
  Pages applies it. `test/fixtures/presets.json` holds the colours of the
  app's 16 presets. `test/stamp.test.js` checks the versions, also on a
  copy of `public/` with a built gallery.
