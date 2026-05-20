import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadApiEnv(cwd = process.cwd()) {
  const shellEnvKeys = new Set(Object.keys(process.env));
  loadEnvFile(resolve(cwd, '.env'), shellEnvKeys);
  loadEnvFile(resolve(cwd, '.env.local'), shellEnvKeys);
}

function loadEnvFile(path: string, shellEnvKeys: Set<string>) {
  if (!existsSync(path)) return;

  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry || shellEnvKeys.has(entry.key)) continue;
    process.env[entry.key] = entry.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const separator = trimmed.indexOf('=');
  if (separator <= 0) return null;

  const key = trimmed.slice(0, separator).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) return null;

  return {
    key,
    value: stripQuotes(trimmed.slice(separator + 1).trim()),
  };
}

function stripQuotes(value: string) {
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value;
  return value.slice(1, -1);
}
