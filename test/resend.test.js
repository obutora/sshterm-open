// The resend page (/desktop/resend, /ja/desktop/resend): it sends the entered
// email address and the Turnstile token to the license Worker, and says the
// same thing whether or not the address bought.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { run, STRINGS } from '../public/resend.js';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');

function fakePage(lang, { email = 'buyer@example.com', token = 'tok', answer = { status: 202, body: { ok: true } } } = {}) {
  const el = () => ({ hidden: false, textContent: '', value: '', disabled: false, listeners: {},
    addEventListener(t, fn) { this.listeners[t] = fn; } });
  const form = el();
  form.elements = { email: { value: email }, 'cf-turnstile-response': token === null ? undefined : { value: token } };
  const ids = { form, status: el(), send: el() };
  const calls = [];
  const resets = [];
  const env = {
    document: { documentElement: { lang }, getElementById: (id) => ids[id] ?? null },
    fetch: async (url, init) => {
      calls.push([url, init.method, JSON.parse(init.body)]);
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    },
    turnstile: () => ({ reset: () => resets.push(1) }),
  };
  const submit = async () => {
    let prevented = false;
    await form.listeners.submit({ preventDefault: () => { prevented = true; } });
    return prevented;
  };
  return { env, ids, calls, resets, submit };
}

test('sends the address, the language and the Turnstile token, then says the same for any address', async () => {
  for (const lang of ['en', 'ja']) {
    const { env, ids, calls, resets, submit } = fakePage(lang, { email: '  buyer@example.com ' });
    run(env);
    assert.equal(await submit(), true);
    assert.deepEqual(calls, [['/api/license/resend', 'POST', { email: 'buyer@example.com', lang, turnstile: 'tok' }]]);
    assert.equal(ids.status.textContent, STRINGS[lang].sent);
    assert.equal(resets.length, 1, 'a Turnstile token works once, so the widget is reset');
    assert.equal(ids.send.disabled, false);
  }
});

test('asks to finish the check first when there is no Turnstile token yet', async () => {
  for (const token of [null, '']) {
    const { env, ids, calls, submit } = fakePage('en', { token });
    run(env);
    await submit();
    assert.equal(calls.length, 0);
    assert.equal(ids.status.textContent, STRINGS.en.noToken);
  }
});

test('too many tries, a failed check and a failure each say so', async () => {
  for (const [answer, want] of [
    [{ status: 429, body: { error: 'rate_limited' } }, 'tooMany'],
    [{ status: 403, body: { error: 'turnstile' } }, 'noToken'],
    [{ status: 400, body: { error: 'bad_request' } }, 'badEmail'],
    [{ status: 500, body: {} }, 'failed'],
    [new Error('offline'), 'failed'],
  ]) {
    for (const lang of ['en', 'ja']) {
      const { env, ids, resets, submit } = fakePage(lang, { answer });
      run(env);
      await submit();
      assert.equal(ids.status.textContent, STRINGS[lang][want], want);
      assert.equal(resets.length, 1, want);
    }
  }
});

test('both languages have every string', () => {
  assert.deepEqual(Object.keys(STRINGS.ja).sort(), Object.keys(STRINGS.en).sort());
});

test('the pages load their own files and only the Turnstile script, with the resend action', () => {
  for (const path of ['desktop/resend.html', 'ja/desktop/resend.html']) {
    const html = read(path);
    assert.match(html, /<script type="module" src="\/resend.js"><\/script>/, path);
    assert.match(html, /<script src="https:\/\/challenges.cloudflare.com\/turnstile\/v0\/api.js" async defer><\/script>/, path);
    assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]).sort(),
      ['/resend.js', 'https://challenges.cloudflare.com/turnstile/v0/api.js'], path);
    assert.match(html, /class="cf-turnstile" data-sitekey="[^"]+" data-action="resend"/, path);
    assert.match(html, /<input [^>]*type="email"[^>]*name="email"[^>]*required/, path);
    for (const id of ['form', 'status', 'send']) assert.match(html, new RegExp(`id="${id}"`), `${path} #${id}`);
    assert.match(html, /id="status"[^>]*aria-live="polite"/, path);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)|<style|\sstyle=|\son\w+=/, path);
  }
  assert.match(read('desktop/resend.html'), /<html lang="en">/);
  assert.match(read('ja/desktop/resend.html'), /<html lang="ja">/);
});

test('only the resend pages may load Turnstile, and they connect only to their own origin', () => {
  const headers = read('_headers');
  for (const path of ['/desktop/resend', '/ja/desktop/resend']) {
    const block = headers.split(/\n(?=\S)/).find((b) => b.startsWith(`${path}\n`));
    assert.ok(block, path);
    assert.match(block, /! Content-Security-Policy/);
    assert.match(block, /Content-Security-Policy: default-src 'none'; script-src 'self' https:\/\/challenges.cloudflare.com; frame-src https:\/\/challenges.cloudflare.com; style-src 'self'; img-src 'self'; connect-src 'self';/);
  }
  assert.equal(headers.match(/challenges\.cloudflare\.com/g).length, 4);
});

test('the purchase-complete page links to the resend page', () => {
  assert.match(read('desktop/purchased.html'), /href="\/desktop\/resend"/);
  assert.match(read('ja/desktop/purchased.html'), /href="\/ja\/desktop\/resend"/);
});

test('the privacy policy names Turnstile and the per-IP limit', () => {
  assert.match(read('privacy.html'), /Cloudflare Turnstile/);
  assert.match(read('privacy.html'), /IP address/);
  assert.match(read('ja/privacy.html'), /Cloudflare Turnstile/);
  assert.match(read('ja/privacy.html'), /IP アドレス/);
});
