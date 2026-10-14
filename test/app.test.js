import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeFor, storeLinks } from '../public/app.js';

const APP_STORE = 'https://apps.apple.com/app/id6759213045';
const PLAY = 'https://play.google.com/store/apps/details?id=com.obuto.sshterm';

test('without a campaign, the plain store pages', () => {
  assert.deepEqual(storeLinks(''), { appStore: APP_STORE, play: PLAY });
  assert.deepEqual(storeLinks('?x=1&id=evil'), { appStore: APP_STORE, play: PLAY });
});

test('a campaign goes to both stores', () => {
  assert.deepEqual(
    storeLinks('?utm_source=x&utm_medium=social&utm_campaign=ja_command_center&ref=1'),
    {
      appStore: `${APP_STORE}?ct=ja_command_center`,
      play: `${PLAY}&utm_source=x&utm_medium=social&utm_campaign=ja_command_center`,
    },
  );
  const long = 'c'.repeat(50);
  assert.equal(storeLinks(`?utm_campaign=${long}`).appStore, `${APP_STORE}?ct=${'c'.repeat(40)}`);
});

test('phones go to their store, computers to neither', () => {
  assert.equal(storeFor('ios'), 'appStore');
  assert.equal(storeFor('android'), 'play');
  assert.equal(storeFor('android-wv'), 'play');
  assert.equal(storeFor('desktop'), null);
});
