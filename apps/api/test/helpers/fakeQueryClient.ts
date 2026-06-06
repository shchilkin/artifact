interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

export function createFakeQueryClient(results: unknown[][]) {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }> {
      calls.push({ sql, values });
      return { rows: (results.shift() ?? []) as Row[] };
    },
  };
}
