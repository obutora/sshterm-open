// The SSH Term Desktop sales page (/desktop, /ja/desktop): it must work under
// the site's CSP (no script, no inline style, only the site's own images) and
// keep the live download and Payment Links of its language.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const path = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => readFileSync(path(p), 'utf8');

const DMG = 'https://github.com/obutora/sshterm-desktop/releases/latest/download/SSHTermDesktop.dmg';
const PAGES = {
  en: { file: 'desktop.html', buy: 'https://buy.stripe.com/5kQcMYgbjfLn8us9woffy01?locale=en' },
  ja: { file: 'ja/desktop.html', buy: 'https://buy.stripe.com/9B64gs7EN2YBeSQcIAffy02?locale=ja' },
};

test('the sales page has no script and no inline style, so the CSP lets it render', () => {
  for (const { file } of Object.values(PAGES)) {
    assert.doesNotMatch(read(file), /<script|<style|\sstyle=|\son\w+=/, file);
  }
});

test('every image and stylesheet on the sales page is one of the site\'s own files', () => {
  for (const { file } of Object.values(PAGES)) {
    const html = read(file);
    const refs = [...html.matchAll(/<(?:img|link)\b[^>]*\s(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((ref) => !ref.startsWith('https://sshterm.iru-yo.com/'));
    assert.ok(refs.length > 0, file);
    for (const ref of refs) {
      assert.match(ref, /^\//, `${file}: ${ref}`);
      assert.ok(existsSync(path(ref.slice(1))), `${file}: ${ref} is missing`);
    }
  }
});

test('the sales page downloads the Mac DMG and buys with the Payment Link of its language', () => {
  for (const [lang, { file, buy }] of Object.entries(PAGES)) {
    const html = read(file);
    assert.match(html, new RegExp(`<html lang="${lang}">`), file);
    assert.ok(html.includes(`href="${DMG}"`), `${file}: download`);
    const buys = [...html.matchAll(/href="(https:\/\/buy\.stripe\.com\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(buys.length > 0, `${file}: buy`);
    for (const link of buys) assert.equal(link.replaceAll('&amp;', '&'), buy, file);
  }
});
