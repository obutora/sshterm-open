// A stand-in for a Cloudflare D1 binding, on node:sqlite in memory, with the
// polls' migrations applied: the same SQL runs as on D1. It has the parts of
// D1's API the polls use: prepare → bind → run / first / all, and batch (one
// transaction). `writes` counts the statements run that are not a SELECT.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../polls/migrations/', import.meta.url);

class Statement {
  constructor(d1, sql, params = []) {
    Object.assign(this, { d1, sql, params });
  }

  get db() {
    return this.d1.db;
  }

  bind(...params) {
    for (const p of params) {
      if (p === undefined) throw new Error('D1_TYPE_ERROR: undefined is not a bindable value');
    }
    return new Statement(this.d1, this.sql, params);
  }

  runSync() {
    if (!/^\s*select/i.test(this.sql)) this.d1.writes++;
    const { changes } = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes } };
  }

  allSync() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })) };
  }

  async run() {
    return this.runSync();
  }

  async all() {
    return this.allSync();
  }

  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (!row) return null;
    return column === undefined ? { ...row } : row[column];
  }
}

export class FakeD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.writes = 0;
    for (const name of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
      this.db.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
    }
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = statements.map((s) => (/^\s*select/i.test(s.sql) ? s.allSync() : s.runSync()));
      this.db.exec('COMMIT');
      return results;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Every row of [table], for the tests to look inside. */
  rows(table) {
    return this.db.prepare(`SELECT * FROM ${table}`).all().map((r) => ({ ...r }));
  }
}
