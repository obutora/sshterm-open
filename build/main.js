// npm run build: builds the polls (build/polls.js) and the theme gallery into
// public/, then, on Pages (CF_PAGES is set), versions the links to the site's
// own files (build/stamp.js). Locally the committed files stay as they are.
//
//   POLLS_DEFINITION  the polls' definition file; default polls/polls.json
//   THEMES_REPO       the repository to clone (URL or path); default
//                     https://github.com/obutora/sshterm-themes.git
//   THEMES_REF        its branch; default main
//
// Exits 1, writing nothing, when the polls' definition or a theme breaks a
// rule: one JSON line per problem on stderr.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_REPO, GalleryError, buildGallery } from './gallery.js';
import { DEFINITION, PollsError, buildPolls, readDefinition } from './polls.js';
import { stampSite } from './stamp.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const definition = process.env.POLLS_DEFINITION || DEFINITION;
try {
  // The definition first: a broken one stops the build before anything is written.
  const polls = readDefinition(readFileSync(definition));
  await buildGallery({
    repo: process.env.THEMES_REPO || DEFAULT_REPO,
    ref: process.env.THEMES_REF || 'main',
    publicDir,
  });
  await buildPolls({ polls, publicDir });
  if (process.env.CF_PAGES) stampSite(publicDir);
} catch (e) {
  if (e instanceof PollsError) {
    console.error('The site is not built: polls/polls.json breaks its rules.');
  } else if (e instanceof GalleryError) {
    console.error('The gallery is not built: these files of sshterm-themes break its rules.');
  } else {
    throw e;
  }
  for (const problem of e.problems) console.error(JSON.stringify(problem));
  process.exitCode = 1;
}
