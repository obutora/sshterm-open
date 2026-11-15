// HTML for the build's pages (the theme gallery, build/gallery.js, and the
// polls, build/polls.js): a template tag that escapes every value unless it is
// markup already.

/** Markup that goes in as it is. Everything else is escaped. */
export class Html {
  constructor(text) {
    this.text = text;
  }

  toString() {
    return this.text;
  }
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

function piece(value) {
  if (value instanceof Html) return value.text;
  if (Array.isArray(value)) return value.map(piece).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

/** A template whose ${values} are escaped unless they are Html (or arrays of it). */
export function html(strings, ...values) {
  return new Html(strings.reduce((out, s, i) => out + piece(values[i - 1]) + s));
}
