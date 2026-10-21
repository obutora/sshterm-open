// A throwaway sshterm-themes repository for the gallery build's tests: a git
// repository on main whose commits put the given files at the given dates.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PRESETS = JSON.parse(readFileSync(new URL('./fixtures/presets.json', import.meta.url), 'utf8'));

/** A format v1 document of one theme: Dracula's colours unless [colors]. */
export function themeFile({ id, name, author = 'Haga', license = 'MIT', basedOn, colors }) {
  const theme = { id, name, author, license };
  if (basedOn) theme.basedOn = basedOn;
  theme.colors = colors ?? PRESETS.dark.dracula.colors;
  return JSON.stringify({ format: 'ssh-term-theme', formatVersion: 1, themes: [theme] }, null, 2);
}

/** The app's 16 presets: {key: {name, colors}} for 'dark' and 'light'. */
export { PRESETS };

/**
 * A git repository (main) with one commit per entry of [commits]:
 * {date: ISO string, files: {path: content | null (removes)}, prDate?}. With
 * prDate the files are committed at prDate on a branch that is merged into
 * main (--no-ff) at date, as a pull request is. Returns its path and a cleanup.
 */
export function themesRepo(commits) {
  const dir = mkdtempSync(join(tmpdir(), 'sshterm-themes-'));
  const git = (args, date) => execFileSync('git', args, {
    cwd: dir,
    env: {
      ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  git(['init', '--quiet', '--initial-branch=main']);
  git(['commit', '--quiet', '--allow-empty', '-m', 'Start'], '2026-01-01T00:00:00Z');
  for (const [i, { date, files, prDate }] of commits.entries()) {
    if (prDate) git(['checkout', '--quiet', '-b', `pr-${i}`]);
    for (const [path, content] of Object.entries(files)) {
      const file = join(dir, path);
      if (content === null) {
        rmSync(file);
        continue;
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    git(['add', '--all']);
    git(['commit', '--quiet', '--allow-empty', '-m', `Commit ${i}`], prDate ?? date);
    if (prDate) {
      git(['checkout', '--quiet', 'main']);
      git(['merge', '--quiet', '--no-ff', '-m', `Merge ${i}`, `pr-${i}`], date);
    }
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** An empty directory standing in for public/, and a cleanup. */
export function outDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sshterm-public-'));
  mkdirSync(join(dir, 'themes'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
