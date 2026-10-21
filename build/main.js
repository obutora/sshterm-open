// npm run build: builds the theme gallery into public/ from sshterm-themes.
//
//   THEMES_REPO  the repository to clone (URL or path); default
//                https://github.com/obutora/sshterm-themes.git
//   THEMES_REF   its branch; default main
//
// Exits 1, writing nothing, when a theme breaks a rule: one JSON line per
// problem on stderr.

import { fileURLToPath } from 'node:url';
import { DEFAULT_REPO, GalleryError, buildGallery } from './gallery.js';

try {
  await buildGallery({
    repo: process.env.THEMES_REPO || DEFAULT_REPO,
    ref: process.env.THEMES_REF || 'main',
    publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  });
} catch (e) {
  if (!(e instanceof GalleryError)) throw e;
  console.error('The gallery is not built: these files of sshterm-themes break its rules.');
  for (const problem of e.problems) console.error(JSON.stringify(problem));
  process.exitCode = 1;
}
