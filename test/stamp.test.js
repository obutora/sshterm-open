// build/stamp.js: the links to the site's own files carry their version.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGallery } from '../build/gallery.js';
import { stampSite } from '../build/stamp.js';
import { themeFile, themesRepo } from './themes-repo.js';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A throwaway public/ holding [files] ({path: content}); returns its reader. */
function site(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sshterm-stamp-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return { dir, read: (p) => readFileSync(join(dir, p), 'utf8') };
}

const PAGE = `<!doctype html>
<link rel="icon" href="/icon.png">
<link rel="stylesheet" href="/a.css">
<script type="module" src="/m.js"></script>
<meta property="og:image" content="https://sshterm.iru-yo.com/icon.png">
<a href="/themes/x.json" download>file</a>
`;
const FILES = {
  'index.html': PAGE,
  'a.css': 'body{color:red}',
  'icon.png': 'png',
  'themes/x.json': '{}',
  'm.js': "import { c } from './lib/c.js';\nexport { c };\n",
  'lib/c.js': 'export const c = 1;\n',
};

/** The ?v= of [url] in [text]. */
const versionIn = (text, url) => text.match(new RegExp(`${url.replace(/[.?/]/g, '\\$&')}\\?v=([0-9a-f]{12})["']`))?.[1];

test("a page's links to the site's CSS, JS and images get a version; other links stay", () => {
  const { dir, read } = site(FILES);
  stampSite(dir);
  const page = read('index.html');
  for (const url of ['/icon.png', '/a.css', '/m.js']) assert.ok(versionIn(page, url), url);
  assert.match(page, /content="https:\/\/sshterm.iru-yo.com\/icon.png"/);
  assert.match(page, /href="\/themes\/x.json" download/);
  assert.ok(versionIn(read('m.js'), './lib/c.js'), "the module's import");
  assert.equal(read('lib/c.js'), FILES['lib/c.js']);
});

test('a change in an imported module reaches the page through the module that imports it', () => {
  const before = site(FILES);
  const after = site({ ...FILES, 'lib/c.js': 'export const c = 2;\n' });
  stampSite(before.dir);
  stampSite(after.dir);
  assert.notEqual(versionIn(before.read('m.js'), './lib/c.js'), versionIn(after.read('m.js'), './lib/c.js'));
  // The page names m.js, not c.js: a browser holding the old m.js must not keep it.
  assert.notEqual(versionIn(before.read('index.html'), '/m.js'), versionIn(after.read('index.html'), '/m.js'));
  // What did not change keeps its version, so browsers keep their copy.
  assert.equal(versionIn(before.read('index.html'), '/a.css'), versionIn(after.read('index.html'), '/a.css'));
});

test('a link to a file the site does not have fails the build', () => {
  const { dir } = site({ ...FILES, 'index.html': `${PAGE}<link rel="stylesheet" href="/gone.css">\n` });
  assert.throws(() => stampSite(dir), /ENOENT/);
});

test('on the real site with a built gallery, every own link and import is versioned', async () => {
  const pub = mkdtempSync(join(tmpdir(), 'sshterm-public-'));
  dirs.push(pub);
  cpSync(fileURLToPath(new URL('../public', import.meta.url)), pub, { recursive: true });
  const id = '6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f';
  const repo = themesRepo([{ date: '2026-02-01T00:00:00Z', files: { [`themes/octocat/${id}.json`]: themeFile({ id, name: 'Tide' }) } }]);
  try {
    await buildGallery({ repo: repo.dir, publicDir: pub, log: () => {} });
  } finally {
    repo.cleanup();
  }
  stampSite(pub);

  const pages = ['404.html', 'app.html', 'open.html', 'theme.html', 'themes/format.html', 'themes/index.html', `themes/${id}/index.html`];
  for (const page of pages) {
    const html = readFileSync(join(pub, page), 'utf8');
    const own = [...html.matchAll(/\b(?:href|src)=["'](\/[^"']*\.(?:css|js|png|svg)(?:\?[^"']*)?)["']/g)].map((m) => m[1]);
    assert.ok(own.length > 0, page);
    for (const url of own) assert.match(url, /\?v=[0-9a-f]{12}$/, `${page}: ${url}`);
  }
  for (const module of ['app.js', 'open.js', 'theme.js', 'common.js', 'theme-format.js', 'themes/format.js', 'themes/gallery.js']) {
    const js = readFileSync(join(pub, module), 'utf8');
    for (const [, spec] of js.matchAll(/\b(?:from|import)\s*['"](\.[^'"]*)['"]/g)) {
      assert.match(spec, /\.js\?v=[0-9a-f]{12}$/, `${module}: ${spec}`);
    }
  }
});
