// The poll definition's rules (polls/rules.js): what the build, the Functions
// and the cron Worker take from polls/polls.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkDefinition } from '../polls/rules.js';
import { CLOSES_MS, DAY, OPENS_MS, definition, poll } from './polls-fixtures.js';

/** The rules' problems for a definition of [polls], as "path rule" strings. */
function problems(...polls) {
  const result = checkDefinition(definition(...polls));
  return result.ok ? [] : result.problems.map((p) => `${p.path} ${p.rule}`);
}

const ok = (...polls) => assert.deepEqual(problems(...polls), []);

test('a poll takes the defaults: 14 days open, 500 for free text, the announcement 30 days from the deadline', () => {
  const result = checkDefinition(definition(poll({
    freeText: { label: { en: 'Anything else?' } },
    announcement: { title: { en: 'We started on SFTP' }, body: { en: 'Thanks for answering.' } },
  })));
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  const [p] = result.polls;
  assert.equal(p.opensAt, OPENS_MS);
  assert.equal(p.closesAt, OPENS_MS + 14 * DAY);
  assert.deepEqual(p.freeText, { label: { en: 'Anything else?' }, maxLength: 500 });
  assert.deepEqual(p.announcement, {
    title: { en: 'We started on SFTP' },
    body: { en: 'Thanks for answering.' },
    link: null,
    from: CLOSES_MS,
    until: CLOSES_MS + 30 * DAY,
  });
});

test('given times, the free text length and the link are kept; text is kept trimmed', () => {
  const result = checkDefinition(definition(poll({
    title: { en: '  Next?  ', ko: '다음은?', vi: 'Tiếp theo?', zh: '下一步？', zh_Hant: '下一步？' },
    closesAt: '2026-12-08T09:00:00+09:00',
    freeText: { label: { en: 'Why?' }, maxLength: 1000 },
    announcement: {
      title: { en: 'Done' }, body: { en: 'Read more.' }, link: 'https://discord.gg/abc',
      from: '2026-12-10T00:00:00Z', until: '2026-12-20T00:00:00Z',
    },
  })));
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  const [p] = result.polls;
  assert.equal(p.title.en, 'Next?');
  assert.equal(p.closesAt, Date.parse('2026-12-08T00:00:00Z'));
  assert.equal(p.freeText.maxLength, 1000);
  assert.equal(p.announcement.link, 'https://discord.gg/abc');
  assert.equal(p.announcement.from, Date.parse('2026-12-10T00:00:00Z'));
  assert.equal(p.announcement.until, Date.parse('2026-12-20T00:00:00Z'));
});

test('the shipped definition holds no poll and passes', () => {
  const doc = JSON.parse(readFileSync(new URL('../polls/polls.json', import.meta.url), 'utf8'));
  const result = checkDefinition(doc);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.polls, []);
});

test('the title, options, label and announcement title have their lengths, in code points once trimmed', () => {
  ok(poll({ title: { en: 'a'.repeat(60) } }));
  ok(poll({ title: { en: ` ${'😀'.repeat(60)} ` } }));
  assert.deepEqual(problems(poll({ title: { en: 'a'.repeat(61) } })), ['polls[0].title.en tooLong']);
  assert.deepEqual(problems(poll({ title: { en: 'a', ja: '😀'.repeat(61) } })), ['polls[0].title.ja tooLong']);
  assert.deepEqual(problems(poll({ title: { en: '   ' } })), ['polls[0].title.en empty']);
  assert.deepEqual(problems(poll({ options: [{ en: 'a'.repeat(41) }, { en: 'b' }] })), ['polls[0].options[0].en tooLong']);
  assert.deepEqual(problems(poll({ freeText: { label: { en: 'a'.repeat(81) } } })), ['polls[0].freeText.label.en tooLong']);
  const announcement = (title, body) => ({ announcement: { title: { en: title }, body: { en: body } } });
  ok(poll(announcement('a'.repeat(40), 'b'.repeat(300))));
  assert.deepEqual(problems(poll(announcement('a'.repeat(41), 'b'))), ['polls[0].announcement.title.en tooLong']);
  assert.deepEqual(problems(poll(announcement('a', 'b'.repeat(301)))), ['polls[0].announcement.body.en tooLong']);
});

test('no control characters and none that turn the direction (ADR 0015)', () => {
  for (const bad of ['a\u202eb', 'a\nb', 'a\tb', 'a\u0085b', 'a\u200fb', 'a\u2066b', 'a\u061cb', 'a\u007fb']) {
    assert.deepEqual(problems(poll({ title: { en: bad } })), ['polls[0].title.en forbiddenCharacter'], JSON.stringify(bad));
  }
  assert.deepEqual(problems(poll({ options: [{ en: 'a' }, { en: 'b', ja: 'x\u202dy' }] })), ['polls[0].options[1].ja forbiddenCharacter']);
});

test('every text has English, and only the six languages', () => {
  assert.deepEqual(problems(poll({ title: { ja: 'だけ' } })), ['polls[0].title.en missingField']);
  assert.deepEqual(problems(poll({ title: { en: 'a', fr: 'b' } })), ['polls[0].title.fr unknownField']);
  assert.deepEqual(problems(poll({ title: 'a' })), ['polls[0].title wrongType']);
});

test('two to five options', () => {
  const opts = (n) => Array.from({ length: n }, (_, i) => ({ en: `Option ${i}` }));
  ok(poll({ options: opts(2) }));
  ok(poll({ options: opts(5) }));
  assert.deepEqual(problems(poll({ options: opts(1) })), ['polls[0].options tooFew']);
  assert.deepEqual(problems(poll({ options: opts(6) })), ['polls[0].options tooMany']);
});

test('free text is 1–1000 long, 500 when not given', () => {
  ok(poll({ freeText: { label: { en: 'x' }, maxLength: 1 } }));
  assert.deepEqual(problems(poll({ freeText: { label: { en: 'x' }, maxLength: 1001 } })), ['polls[0].freeText.maxLength outOfRange']);
  assert.deepEqual(problems(poll({ freeText: { label: { en: 'x' }, maxLength: 0 } })), ['polls[0].freeText.maxLength outOfRange']);
  assert.deepEqual(problems(poll({ freeText: { label: { en: 'x' }, maxLength: 2.5 } })), ['polls[0].freeText.maxLength wrongType']);
  assert.deepEqual(problems(poll({ freeText: { maxLength: 10 } })), ['polls[0].freeText.label missingField']);
});

test('the announcement link is https on discord.gg, discord.com, sshterm.iru-yo.com or github.com only', () => {
  const linked = (link) => poll({ announcement: { title: { en: 't' }, body: { en: 'b' }, link } });
  for (const link of [
    'https://discord.gg/abc', 'https://discord.com/invite/abc', 'https://sshterm.iru-yo.com/polls/next-feature',
    'https://github.com/obutora/sshterm-open/issues/1', 'https://github.com',
  ]) ok(linked(link));
  for (const link of [
    'http://github.com/', 'https://evil.example/', 'https://www.github.com/', 'https://github.com.evil.example/',
    'https://github.com@evil.example/', 'https://user@github.com/', 'https://github.com:8443/', 'javascript:alert(1)',
    'https://GITHUB.com/', 'https://github.com/a b', ' https://github.com/',
  ]) assert.deepEqual(problems(linked(link)), ['polls[0].announcement.link badLink'], link);
});

test('times: ISO 8601 with a zone; the deadline after the start; the announcement not before the deadline', () => {
  assert.deepEqual(problems(poll({ opensAt: '2026-12-01' })), ['polls[0].opensAt badTime']);
  assert.deepEqual(problems(poll({ opensAt: '2026-12-01T00:00:00' })), ['polls[0].opensAt badTime']);
  assert.deepEqual(problems(poll({ opensAt: '2026-13-01T00:00:00Z' })), ['polls[0].opensAt badTime']);
  assert.deepEqual(problems(poll({ closesAt: OPENS_MS })), ['polls[0].closesAt wrongType']);
  assert.deepEqual(problems(poll({ closesAt: '2026-12-01T00:00:00Z' })), ['polls[0].closesAt notAfterOpening']);
  const announced = (extra) => poll({ announcement: { title: { en: 't' }, body: { en: 'b' }, ...extra } });
  assert.deepEqual(problems(announced({ from: '2026-12-14T23:59:59Z' })), ['polls[0].announcement.from beforeDeadline']);
  assert.deepEqual(problems(announced({ from: '2026-12-20T00:00:00Z', until: '2026-12-20T00:00:00Z' })), ['polls[0].announcement.until notAfterFrom']);
});

test('ids are unique slugs, and no two polls are open at once', () => {
  assert.deepEqual(problems(poll({ id: 'Next' })), ['polls[0].id badId']);
  assert.deepEqual(problems(poll({ id: 'a'.repeat(41) })), ['polls[0].id badId']);
  assert.deepEqual(problems(poll({ id: 'index' })), ['polls[0].id badId']);
  ok(poll({ id: 'a' }), poll({ id: 'b', opensAt: '2026-12-15T00:00:00Z' }));
  assert.deepEqual(problems(poll({ id: 'a' }), poll({ id: 'a', opensAt: '2027-01-01T00:00:00Z' })), ['polls[1].id idTaken']);
  assert.deepEqual(problems(poll({ id: 'a' }), poll({ id: 'b', opensAt: '2026-12-14T23:00:00Z' })), ['polls[1].opensAt overlaps']);
});

test('unknown fields and a broken file are refused', () => {
  assert.deepEqual(problems(poll({ colour: 'red' })), ['polls[0].colour unknownField']);
  assert.deepEqual(checkDefinition({ polls: [], extra: 1 }).problems, [{ path: 'extra', rule: 'unknownField' }]);
  assert.deepEqual(checkDefinition([]).problems, [{ path: '', rule: 'wrongType' }]);
  assert.deepEqual(checkDefinition({}).problems, [{ path: 'polls', rule: 'missingField' }]);
  assert.equal(checkDefinition({ $schema: './schema/definition.schema.json', polls: [] }).ok, true);
});
