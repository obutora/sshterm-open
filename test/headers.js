// public/_headers as Cloudflare Pages applies it, for the tests.

import { readFileSync } from 'node:fs';

/**
 * The headers Cloudflare Pages sends for [path] by public/_headers: the
 * blocks whose URL pattern matches, in the file's order; `! Name` removes
 * what earlier blocks set, a name set again is joined with a comma.
 */
export function headersFor(path) {
  const headers = new Map();
  const file = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const blocks = file.split(/\n(?=\S)/).map((b) => b.split('\n'));
  for (const [pattern, ...lines] of blocks) {
    if (pattern.startsWith('#')) continue;
    const source = pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    if (!new RegExp(`^${source}$`).test(path)) continue;
    for (const line of lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
      if (line.startsWith('! ')) {
        headers.delete(line.slice(2).toLowerCase());
        continue;
      }
      const [name, value] = [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()];
      headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
    }
  }
  return headers;
}
