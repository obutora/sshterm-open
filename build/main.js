// npm run build: builds the theme gallery into public/ from sshterm-themes,
// then, on Pages (CF_PAGES is set), versions the links to the site's own
// files (build/stamp.js). Locally the committed files stay as they are.
//
//   THEMES_REPO  the repository to clone (URL or path); default
//                https://github.com/obutora/sshterm-themes.git
//   THEMES_REF   its branch; default main
//
// Exits 1, writing nothing, when a theme breaks a rule: one JSON line per
// problem on stderr.

import { fileURLToPath } from 'node:url';
import { DEFAULT_REPO, GalleryError, buildGallery } from './gallery.js';
import { stampSite } from './stamp.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
try {
  await buildGallery({
    repo: process.env.THEMES_REPO || DEFAULT_REPO,
    ref: process.env.THEMES_REF || 'main',
    publicDir,
  });
  if (process.env.CF_PAGES) stampSite(publicDir);
} catch (e) {
  if (!(e instanceof GalleryError)) throw e;
  console.error('The gallery is not built: these files of sshterm-themes break its rules.');
  for (const problem of e.problems) console.error(JSON.stringify(problem));
  process.exitCode = 1;
}
