// The JSON Schema of the theme format v1 (public/themes/schema/v1.json)
// against the app's own examples (test/fixtures/theme_format/, copied from
// the app): wherever the manifest says a schema can say it ("jsonSchema":
// "same"), the schema takes and refuses what the app does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020Module from 'ajv/dist/2020.js';

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const FIXTURES = new URL('./fixtures/theme_format/', import.meta.url);
const SCHEMA_URL = 'https://sshterm.iru-yo.com/themes/schema/v1.json';

const schema = JSON.parse(
  readFileSync(new URL('../public/themes/schema/v1.json', import.meta.url), 'utf8'),
);
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', FIXTURES), 'utf8'));

/** The schema's verdict on a file's bytes, JSON.parse standing in for "is JSON". */
function schemaTakes(bytes) {
  let doc;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return false;
  }
  return validate(doc);
}

test('the schema is 2020-12 and names its own URL', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, SCHEMA_URL);
});

test('every example is in the manifest, once', () => {
  const listed = manifest.cases.map((c) => c.file);
  const onDisk = readdirSync(FIXTURES, { recursive: true })
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => f.split('\\').join('/'));
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual(new Set(listed), new Set(onDisk));
});

for (const c of manifest.cases) {
  const name = `${c.file} is ${c.valid ? 'taken' : `refused (${c.reason})`}: ${c.note}`;
  if (c.jsonSchema !== 'same') {
    test(name, { skip: 'not expressible in JSON Schema' }, () => {});
    continue;
  }
  test(name, () => {
    const bytes = readFileSync(new URL(c.file, FIXTURES));
    assert.equal(schemaTakes(bytes), c.valid, JSON.stringify(validate.errors));
  });
}

test('only the v1 URL is taken as $schema', () => {
  const doc = JSON.parse(readFileSync(new URL('pass/no-based-on.json', FIXTURES), 'utf8'));
  assert.equal(validate({ $schema: SCHEMA_URL, ...doc }), true);
  assert.equal(validate({ $schema: `${SCHEMA_URL}#`, ...doc }), false);
  assert.equal(validate({ $schema: 1, ...doc }), false);
});
