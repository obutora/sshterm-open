// The privacy policy (/privacy, /ja/privacy) must describe polls before the
// app version that reads /polls/current.json ships (ADR 0024).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const pages = { en: read('privacy.html'), ja: read('ja/privacy.html') };

test('both privacy pages list current.json as something the mobile app reads', () => {
  for (const html of Object.values(pages)) assert.match(html, /\/polls\/current\.json/);
});

test('both privacy pages have a polls section and the polls revision date', () => {
  assert.match(pages.en, /<h2>Answering polls on the web<\/h2>/);
  assert.match(pages.en, /Revised: November 15, 2026/);
  assert.match(pages.en, /Show polls/);
  assert.match(pages.en, /90 days/);
  assert.match(pages.ja, /<h2>Web でアンケートに答えたとき<\/h2>/);
  assert.match(pages.ja, /改定日：2026年11月15日/);
  assert.match(pages.ja, /アンケートを表示/);
  assert.match(pages.ja, /90 日/);
});

test('both privacy pages keep the app-level promises', () => {
  assert.match(pages.en, /SSH Term sends none of your data to the operator’s servers/);
  assert.match(pages.en, /no analytics, advertising, tracking or crash-reporting SDK/);
  assert.match(pages.ja, /あなたのデータを運営者のサーバーに送りません/);
  assert.match(pages.ja, /アクセス解析・広告・追跡・クラッシュレポートの SDK は入れていません/);
});
