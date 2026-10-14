// The store link (https://sshterm.iru-yo.com/app), one link to share for
// installing SSH Term: phones go straight to their store, computers get both.
// It stores nothing and loads nothing else.

import { localize, pickLang, platformOf } from './common.js';

const APP_STORE = 'https://apps.apple.com/app/id6759213045';
const PLAY = 'https://play.google.com/store/apps/details?id=com.obuto.sshterm';

/** App Store campaign tokens (ct) are at most 40 characters. */
const CT_MAX = 40;

/**
 * The store URLs for a location.search. utm_source, utm_medium and
 * utm_campaign go to Google Play as they are; utm_campaign is also the
 * App Store's campaign token (ct). Other keys are dropped.
 */
export function storeLinks(search) {
  const from = new URLSearchParams(search);
  const play = new URL(PLAY);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = from.get(key);
    if (value) play.searchParams.set(key, value);
  }
  const appStore = new URL(APP_STORE);
  const campaign = from.get('utm_campaign');
  if (campaign) appStore.searchParams.set('ct', campaign.slice(0, CT_MAX));
  return { appStore: appStore.href, play: play.href };
}

/** The store a platform goes to at once, or null (a computer: both shown). */
export function storeFor(platform) {
  if (platform === 'ios') return 'appStore';
  if (platform === 'android' || platform === 'android-wv') return 'play';
  return null;
}

export const STRINGS = {
  en: {
    htmlLang: 'en',
    tagline: 'An SSH terminal for running Claude Code from your phone.',
  },
  ja: {
    htmlLang: 'ja',
    tagline: 'スマホから Claude Code を操作できる SSH ターミナル。',
  },
  ko: {
    htmlLang: 'ko',
    tagline: '휴대폰에서 Claude Code를 조작하는 SSH 터미널.',
  },
  zh: {
    htmlLang: 'zh-Hans',
    tagline: '在手机上操作 Claude Code 的 SSH 终端。',
  },
  zh_Hant: {
    htmlLang: 'zh-Hant',
    tagline: '在手機上操作 Claude Code 的 SSH 終端機。',
  },
};

function main() {
  localize(STRINGS[pickLang(navigator.language, STRINGS)]);
  const $ = (id) => document.getElementById(id);
  const links = storeLinks(location.search);
  $('appstore').href = links.appStore;
  $('play').href = links.play;

  const store = storeFor(platformOf(navigator.userAgent, navigator.maxTouchPoints));
  if (!store) return;
  // The buttons stay for when the redirect is blocked: the phone's store first.
  if (store === 'play') $('stores').prepend($('play'));
  location.replace(links[store]);
}

if (typeof document !== 'undefined') main();
