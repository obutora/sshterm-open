// Versions the site's own files in the links to them, so a browser never
// mixes a new page with an old CSS, JS or image. The CDN lets browsers keep
// .css, .js, .png and .svg for hours without asking again (the zone's Browser
// Cache TTL; a header from Pages cannot lower it), while pages are asked for
// every time. A link with ?v=<hash of the file as served> changes whenever
// the file does, so the browser loads the new one.
//
// The pages' root-relative links (href="/…" and src="/…" to those types) and
// the modules' relative imports (from './x.js') get the query. A module's
// hash covers its imports' queries, so a change deep in common.js reaches the
// pages through every module that imports it.
//
// It rewrites public/ in place: Pages runs it on its fresh checkout
// (build/main.js); a local `npm run build` leaves the committed files alone.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const PAGE_LINK = /\b(href|src)="(\/[^"?#]*\.(?:css|js|png|svg))"/g;
const IMPORT = /(\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"?#]*\.js)\2/g;

function* filesUnder(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* filesUnder(path);
    else yield path;
  }
}

/** Adds ?v=<hash> to the links of every page and module under [publicDir]. */
export function stampSite(publicDir) {
  const root = resolve(publicDir);
  const served = new Map();
  const open = new Set();

  /** [file] as the site serves it: a module with its imports versioned. */
  const contentOf = (file) => {
    if (served.has(file)) return served.get(file);
    if (!file.startsWith(root + sep)) throw new Error(`${file} is outside ${root}`);
    let content;
    if (file.endsWith('.js')) {
      if (open.has(file)) throw new Error(`import cycle through ${relative(root, file)}`);
      open.add(file);
      content = readFileSync(file, 'utf8').replace(IMPORT, (_, keyword, quote, spec) =>
        `${keyword}${quote}${spec}?v=${versionOf(resolve(dirname(file), spec))}${quote}`);
      open.delete(file);
    } else {
      content = readFileSync(file);
    }
    served.set(file, content);
    return content;
  };
  const versionOf = (file) => createHash('sha256').update(contentOf(file)).digest('hex').slice(0, 12);

  for (const file of filesUnder(root)) {
    if (file.endsWith('.html')) {
      const page = readFileSync(file, 'utf8');
      const stamped = page.replace(PAGE_LINK, (_, attr, url) => `${attr}="${url}?v=${versionOf(join(root, url))}"`);
      if (stamped !== page) writeFileSync(file, stamped);
    } else if (file.endsWith('.js')) {
      const module = contentOf(file);
      if (module !== readFileSync(file, 'utf8')) writeFileSync(file, module);
    }
  }
}
