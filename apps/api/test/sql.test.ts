import { describe, expect, it } from 'vitest';
import { identifier, identifierPath, isSqlQuery, joinSql, rawSql, sql } from '../src/db/sql.js';

describe('SQL query helpers', () => {
  it('builds parameterized query text and values', () => {
    const query = sql`select * from users where id = ${'user-1'} and ai_enabled = ${true}`;

    expect(query.text).toBe('select * from users where id = $1 and ai_enabled = $2');
    expect(query.values).toEqual(['user-1', true]);
    expect(isSqlQuery(query)).toBe(true);
  });

  it('composes nested query fragments while renumbering placeholders', () => {
    const filters = sql`user_id = ${'user-1'} and status = ${'queued'}`;
    const query = sql`select * from ai_generation_jobs where ${filters} limit ${10}`;

    expect(query.text).toBe('select * from ai_generation_jobs where user_id = $1 and status = $2 limit $3');
    expect(query.values).toEqual(['user-1', 'queued', 10]);
  });

  it('joins query fragments with a configurable separator', () => {
    const query = sql`select * from users where ${joinSql(
      [sql`id = ${'user-1'}`, sql`email = ${'user@example.com'}`],
      rawSql(' or '),
    )}`;

    expect(query.text).toBe('select * from users where id = $1 or email = $2');
    expect(query.values).toEqual(['user-1', 'user@example.com']);
  });

  it('quotes identifiers and identifier paths', () => {
    const query = sql`select ${identifier('weird"name')} from ${identifierPath(['public', 'users'])}`;

    expect(query.text).toBe('select "weird""name" from "public"."users"');
    expect(query.values).toEqual([]);
  });

  it('rejects invalid identifier inputs', () => {
    expect(() => identifier('')).toThrow('SQL identifier must not be empty.');
    expect(() => identifier('bad\u0000name')).toThrow('SQL identifier must not contain null bytes.');
    expect(() => identifierPath([])).toThrow('SQL identifier path must include at least one part.');
  });

  it('recognizes query fragments without treating plain objects as SQL', () => {
    const query = sql`select ${1}`;

    expect(isSqlQuery(query)).toBe(true);
    expect(isSqlQuery({ text: 'select 1', values: [] })).toBe(false);
  });
});
