// What the open page (/open), the store link (/app) and the theme page (/theme) share.

/**
 * 'ios', 'android', 'android-wv' (an app's own WebView) or 'desktop'.
 */
export function platformOf(ua, maxTouchPoints = 0) {
  if (/Android/.test(ua)) return ua.includes('; wv)') ? 'android-wv' : 'android';
  // iPadOS reports a Mac; only the touch screen tells them apart.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) {
    return 'ios';
  }
  return 'desktop';
}

const HANT_REGIONS = new Set(['tw', 'hk', 'mo']);

/**
 * The key of [strings] (en, ja, ko, zh, zh_Hant: the app's languages) for a
 * BCP 47 tag (navigator.language); 'en' otherwise.
 */
export function pickLang(tag, strings) {
  const [language, ...rest] = String(tag || '').toLowerCase().split(/[-_]/);
  if (language === 'zh') {
    const script = rest.find((p) => p.length === 4);
    const hant = script ? script === 'hant' : rest.some((p) => HANT_REGIONS.has(p));
    return hant ? 'zh_Hant' : 'zh';
  }
  return Object.hasOwn(strings, language) ? language : 'en';
}

/** Fills every [data-t] element of the page from [t] and sets its language. */
export function localize(t, doc = document) {
  doc.documentElement.lang = t.htmlLang;
  for (const el of doc.querySelectorAll('[data-t]')) {
    el.textContent = t[el.dataset.t];
  }
}
