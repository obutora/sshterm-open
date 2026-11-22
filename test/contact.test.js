// The contact page (/contact, /ja/contact), the pages that link to it, and
// what the terms, the privacy policy and the sales page say about refunded
// keys and the list of refunded purchases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { headersFor } from './headers.js';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');

const PAGES = { en: 'contact.html', ja: 'ja/contact.html' };

test('the contact page exists in both languages, plain HTML with no script', () => {
  for (const [lang, path] of Object.entries(PAGES)) {
    const html = read(path);
    assert.match(html, new RegExp(`<html lang="${lang}">`), path);
    assert.doesNotMatch(html, /<script|<style|\sstyle=|\son\w+=/, path);
    assert.match(html, /href="mailto:support\.iruyo@gmail\.com"/, path);
    assert.match(html, /SSH Term Desktop/, path);
  }
  assert.match(read(PAGES.en), /hreflang="ja" href="https:\/\/sshterm\.iru-yo\.com\/ja\/contact"/);
  assert.match(read(PAGES.ja), /hreflang="en" href="https:\/\/sshterm\.iru-yo\.com\/contact"/);
});

test('the contact page links to the resend page and the terms in its own language', () => {
  assert.match(read(PAGES.en), /href="\/desktop\/resend"/);
  assert.match(read(PAGES.en), /href="\/terms"/);
  assert.match(read(PAGES.ja), /href="\/ja\/desktop\/resend"/);
  assert.match(read(PAGES.ja), /href="\/ja\/terms"/);
});

test('the contact page keeps the site-wide headers: no connections, noindex', () => {
  for (const path of ['/contact', '/ja/contact']) {
    const headers = headersFor(path);
    assert.match(headers.get('content-security-policy'), /^default-src 'none'; script-src 'self';/, path);
    assert.doesNotMatch(headers.get('content-security-policy'), /connect-src/, path);
    assert.equal(headers.get('x-robots-tag'), 'noindex', path);
  }
});

test('the sales, purchase-complete, resend, terms and privacy pages link to the contact page', () => {
  for (const page of ['desktop.html', 'desktop/purchased.html', 'desktop/resend.html', 'terms.html', 'privacy.html']) {
    assert.match(read(page), /href="\/contact"/, page);
    assert.match(read(`ja/${page}`), /href="\/ja\/contact"/, `ja/${page}`);
  }
});

test('the terms say a refunded purchase\'s key stops working', () => {
  assert.doesNotMatch(read('terms.html'), /keeps working/);
  assert.match(read('terms.html'), /license key of a refunded purchase stops working/);
  assert.doesNotMatch(read('ja/terms.html'), /キーは止めません/);
  assert.match(read('ja/terms.html'), /返金した購入のライセンスキーは使えなくなります/);
});

test('the privacy policy and the sales page name the list of refunded purchases', () => {
  for (const page of ['privacy.html', 'ja/privacy.html']) {
    assert.match(read(page), /https:\/\/sshterm\.iru-yo\.com\/api\/license\/revoked/, page);
  }
  assert.doesNotMatch(read('privacy.html'), /never goes online/);
  assert.doesNotMatch(read('desktop.html'), /never goes online/);
  assert.doesNotMatch(read('ja/privacy.html'), /外へ通信することはありません/);
  assert.doesNotMatch(read('ja/desktop.html'), /外へ通信することはありません/);
});
