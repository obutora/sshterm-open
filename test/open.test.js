import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkFromHash, pickLang, platformOf } from '../public/open.js';

const H = '0123456789abcdef0123456789abcdef';
const S = '00112233aabbccdd';

test('a host link and a session link', () => {
  assert.equal(linkFromHash(`#h=${H}`), `sshtermx://open?h=${H}`);
  assert.equal(linkFromHash(`#h=${H}&s=${S}`), `sshtermx://open?h=${H}&s=${S}`);
  assert.equal(linkFromHash(`#s=${S}&h=${H}`), `sshtermx://open?h=${H}&s=${S}`);
});

test('other keys are dropped', () => {
  assert.equal(
    linkFromHash(`#h=${H}&x=sshtermx%3A%2F%2Frun&s=${S}&cmd=rm`),
    `sshtermx://open?h=${H}&s=${S}`,
  );
});

test('a malformed or repeated h or s opens nothing', () => {
  for (const hash of [
    '',
    '#',
    `#s=${S}`,
    `#h=${H.toUpperCase()}`,
    `#h=${H.slice(1)}`,
    `#h=${H}0`,
    `#h=${H}&s=`,
    `#h=${H}&s=xyz`,
    `#h=${H}&s=${S}00`,
    `#h=${H}%26x%3D1`,
    `#h=${H}&h=${H}`,
    `#h=${H}&s=${S}&s=${S}`,
    `#h=${H.slice(0, 31)}g`,
  ]) {
    assert.equal(linkFromHash(hash), null, hash);
  }
});

test('platforms by user agent', () => {
  const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15';
  const chrome = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.137 Mobile Safari/537.36';
  const wv = 'Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/BP22.250124.009; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
  assert.equal(platformOf(ios), 'ios');
  assert.equal(platformOf(ipad, 5), 'ios');
  assert.equal(platformOf(ipad, 0), 'desktop');
  assert.equal(platformOf(chrome), 'android');
  assert.equal(platformOf(wv), 'android-wv');
  assert.equal(platformOf(windows), 'desktop');
});

test('the app languages, English otherwise', () => {
  for (const [tag, want] of [
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['en-GB', 'en'],
    ['zh', 'zh'],
    ['zh-CN', 'zh'],
    ['zh-Hans-HK', 'zh'],
    ['zh-TW', 'zh_Hant'],
    ['zh-HK', 'zh_Hant'],
    ['zh-Hant', 'zh_Hant'],
    ['zh-Hant-CN', 'zh_Hant'],
    ['fr-FR', 'en'],
    ['constructor', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ]) {
    assert.equal(pickLang(tag), want, String(tag));
  }
});
