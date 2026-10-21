// A tiny stand-in for the browser, enough for the theme page's main(): the
// elements of public/theme.html by id, createElement, and a location that
// records any navigation. Setting innerHTML throws: the page must not use it.

import { readFileSync } from 'node:fs';

class FakeElement {
  constructor(doc, tag, attrs = {}) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.id = attrs.id ?? '';
    this.hidden = 'hidden' in attrs;
    this.dataset = attrs['data-t'] ? { t: attrs['data-t'] } : {};
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.href = attrs.href ?? '';
    this.styles = {};
    this.listeners = {};
    this.style = { setProperty: (k, v) => { this.styles[k] = v; } };
  }

  set innerHTML(_) {
    throw new Error('innerHTML used');
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  prepend(...nodes) {
    this.children.unshift(...nodes);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  /** This element and all below it. */
  *walk() {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
}

const HTML = readFileSync(new URL('../public/theme.html', import.meta.url), 'utf8');

/** A page of theme.html at [hash], seen by a browser of [ua] and [language]. */
export function fakePage(hash, { ua = 'Mozilla/5.0 (X11; Linux x86_64)', language = 'en', maxTouchPoints = 0 } = {}) {
  const navigations = [];
  const doc = {
    documentElement: { lang: '' },
    created: [],
    byId: new Map(),
    listeners: {},
    visibilityState: 'visible',
    getElementById(id) {
      return this.byId.get(id) ?? null;
    },
    querySelectorAll(selector) {
      if (selector !== '[data-t]') throw new Error(selector);
      return this.all.filter((el) => el.dataset.t);
    },
    createElement(tag) {
      const el = new FakeElement(this, tag);
      this.created.push(el);
      return el;
    },
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    },
    all: [],
  };
  for (const [, tag, rest] of HTML.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const attrs = {};
    for (const [, k, v] of rest.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) attrs[k] = v ?? '';
    if (!attrs.id && !attrs['data-t']) continue;
    const el = new FakeElement(doc, tag, attrs);
    doc.all.push(el);
    if (attrs.id) doc.byId.set(attrs.id, el);
  }
  const record = (how) => (url) => navigations.push([how, String(url)]);
  const location = {
    hash,
    get href() { return `https://sshterm.iru-yo.com/theme${hash}`; },
    set href(url) { record('href')(url); },
    assign: record('assign'),
    replace: record('replace'),
  };
  return {
    env: { document: doc, location, navigator: { userAgent: ua, language, maxTouchPoints } },
    doc,
    navigations,
    $: (id) => doc.byId.get(id),
  };
}
