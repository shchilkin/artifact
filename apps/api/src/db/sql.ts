export type SqlParameter =
  | string
  | number
  | boolean
  | bigint
  | Date
  | Buffer
  | Uint8Array
  | null
  | readonly unknown[]
  | { readonly [key: string]: unknown };

const sqlQueryBrand = Symbol('SqlQuery');

export interface SqlQuery {
  readonly text: string;
  readonly values: readonly SqlParameter[];
  readonly [sqlQueryBrand]: true;
}

export function sql(strings: TemplateStringsArray, ...values: readonly (SqlParameter | SqlQuery)[]): SqlQuery {
  let text = strings[0] ?? '';
  const parameters: SqlParameter[] = [];

  values.forEach((value, index) => {
    if (isSqlQuery(value)) {
      const offset = parameters.length;
      text += shiftPlaceholders(value.text, offset);
      parameters.push(...value.values);
    } else {
      parameters.push(value);
      text += `$${parameters.length}`;
    }

    text += strings[index + 1] ?? '';
  });

  return makeSqlQuery(text, parameters);
}

export function joinSql(parts: readonly SqlQuery[], separator: SqlQuery = rawSql(', ')): SqlQuery {
  if (parts.length === 0) {
    return rawSql('');
  }

  return parts.slice(1).reduce((query, part) => sql`${query}${separator}${part}`, parts[0] ?? rawSql(''));
}

export function rawSql(text: string): SqlQuery {
  return makeSqlQuery(text, []);
}

export function identifier(name: string): SqlQuery {
  return rawSql(quoteIdentifier(name));
}

export function identifierPath(parts: readonly string[]): SqlQuery {
  if (parts.length === 0) {
    throw new Error('SQL identifier path must include at least one part.');
  }

  return rawSql(parts.map(quoteIdentifier).join('.'));
}

export function isSqlQuery(value: unknown): value is SqlQuery {
  return (
    typeof value === 'object' && value !== null && (value as { [sqlQueryBrand]?: unknown })[sqlQueryBrand] === true
  );
}

function makeSqlQuery(text: string, values: readonly SqlParameter[]): SqlQuery {
  return {
    text,
    values,
    [sqlQueryBrand]: true,
  };
}

function quoteIdentifier(name: string): string {
  if (name.length === 0) {
    throw new Error('SQL identifier must not be empty.');
  }

  if (name.includes('\u0000')) {
    throw new Error('SQL identifier must not contain null bytes.');
  }

  return `"${name.replaceAll('"', '""')}"`;
}

function shiftPlaceholders(text: string, offset: number): string {
  if (offset === 0) {
    return text;
  }

  return text.replaceAll(/\$(\d+)/g, (_, placeholder: string) => `$${Number.parseInt(placeholder, 10) + offset}`);
}
