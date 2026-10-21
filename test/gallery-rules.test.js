// The rules the build checks sshterm-themes' files with (build/gallery.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGallery } from '../build/gallery.js';
import { themeFile } from './themes-repo.js';

const TIDE = '6f1c2b9e-3d4a-4b8c-9e7f-0a1b2c3d4e5f';
const REEF = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const bytes = (text) => new TextEncoder().encode(text);
const file = (path, text) => ({ path, file: true, bytes: bytes(text) });
const tide = (path = `themes/octocat/${TIDE}.json`) => file(path, themeFile({ id: TIDE, name: 'Tide' }));

test('a theme at themes/<login>/<id>.json passes, read as the app reads it', () => {
  const got = checkGallery([file(`themes/Octo-cat9/${TIDE}.json`, themeFile({ id: TIDE, name: '  Tide ', author: 'Haga' }))]);
  assert.equal(got.ok, true);
  assert.equal(got.themes.length, 1);
  assert.equal(got.themes[0].login, 'Octo-cat9');
  assert.equal(got.themes[0].theme.name, 'Tide');
});

test('each rule refuses its file', () => {
  const twoThemes = JSON.stringify({
    format: 'ssh-term-theme',
    formatVersion: 1,
    themes: [JSON.parse(themeFile({ id: TIDE, name: 'Tide' })).themes[0], JSON.parse(themeFile({ id: REEF, name: 'Reef' })).themes[0]],
  });
  for (const [entry, want] of [
    [file('themes/README.md', '# Themes'), { rule: 'badPath' }],
    [tide(`themes/octocat/old/${TIDE}.json`), { rule: 'badPath' }],
    [tide(`themes/-octocat/${TIDE}.json`), { rule: 'badLogin' }],
    [tide(`themes/octo--cat/${TIDE}.json`), { rule: 'badLogin' }],
    [tide(`themes/octo.cat/${TIDE}.json`), { rule: 'badLogin' }],
    [tide(`themes/${'a'.repeat(40)}/${TIDE}.json`), { rule: 'badLogin' }],
    [tide('themes/octocat/Tide.json'), { rule: 'badFileName' }],
    [tide(`themes/octocat/${TIDE.toUpperCase()}.json`), { rule: 'badFileName' }],
    [{ path: `themes/octocat/${TIDE}.json`, file: false, bytes: null }, { rule: 'notAFile' }],
    [file(`themes/octocat/${TIDE}.json`, '{'), { rule: 'invalidTheme', reason: 'notJson' }],
    [{ path: `themes/octocat/${TIDE}.json`, file: true, bytes: new Uint8Array(64 * 1024 + 1) }, { rule: 'invalidTheme', reason: 'tooLarge' }],
    [file(`themes/octocat/${TIDE}.json`, themeFile({ id: TIDE, name: 'Tide\u202E' })), { rule: 'invalidTheme', reason: 'badText', field: 'name' }],
    [file(`themes/octocat/${TIDE}.json`, twoThemes), { rule: 'notOneTheme' }],
    [file(`themes/octocat/${REEF}.json`, themeFile({ id: TIDE, name: 'Tide' })), { rule: 'idMismatch' }],
  ]) {
    const got = checkGallery([entry]);
    assert.equal(got.ok, false, entry.path);
    assert.equal(got.problems.length, 1, entry.path);
    assert.deepEqual({ ...got.problems[0], ...want }, got.problems[0], `${entry.path}: ${JSON.stringify(got.problems[0])}`);
    assert.equal(got.problems[0].path, entry.path);
  }
});

test('no id twice, under any directory', () => {
  const other = file(`themes/hubot/${TIDE}.json`, themeFile({ id: TIDE, name: 'Another' }));
  const got = checkGallery([tide(`themes/octocat/${TIDE}.json`), other]);
  assert.deepEqual(got.problems.map((p) => [p.path, p.rule, p.by]), [[`themes/octocat/${TIDE}.json`, 'idTaken', `themes/hubot/${TIDE}.json`]]);
});

test('no name twice, compared after NFKC and ignoring case', () => {
  for (const name of ['Tide', 'TIDE', 'Ｔｉｄｅ', 'tide']) {
    const got = checkGallery([tide(), file(`themes/hubot/${REEF}.json`, themeFile({ id: REEF, name }))]);
    assert.deepEqual(got.problems?.map((p) => p.rule), ['nameTaken'], name);
  }
  assert.equal(checkGallery([tide(), file(`themes/hubot/${REEF}.json`, themeFile({ id: REEF, name: 'Tides' }))]).ok, true);
});

test('every broken file is told, not only the first', () => {
  const got = checkGallery([file('themes/a.json', '{}'), tide('themes/x_y/z.json'), tide()]);
  assert.deepEqual(got.problems.map((p) => p.rule).sort(), ['badLogin', 'badPath']);
});

test('a 前景 under 4.5:1 on its 背景 fails, as sshterm-themes\' check does', () => {
  const colors = (foreground, background) => ({ ...JSON.parse(themeFile({ id: TIDE, name: 'Tide' })).themes[0].colors, foreground, background });
  for (const [foreground, background] of [['#737373', '#000000'], ['#777777', '#FFFFFF'], ['#FFFFFF00', '#000000']]) {
    const got = checkGallery([file(`themes/octocat/${TIDE}.json`, themeFile({ id: TIDE, name: 'Tide', colors: colors(foreground, background) }))]);
    assert.deepEqual(got.problems?.map((p) => p.rule), ['lowContrast'], `${foreground} on ${background}`);
  }
  const got = checkGallery([file(`themes/octocat/${TIDE}.json`, themeFile({ id: TIDE, name: 'Tide', colors: colors('#757575', '#000000') }))]);
  assert.equal(got.ok, true);
});
