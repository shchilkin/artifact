import { existsSync, readFileSync } from 'node:fs';

export function loadEnvFiles(paths) {
  for (const path of paths) {
    loadEnvFile(path);
  }
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const entry of readFileSync(path, 'utf8').split(/\r?\n/).map(parseEnvLine)) {
    if (!entry || process.env[entry.key] !== undefined) continue;
    process.env[entry.key] = entry.value;
  }
}

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/i);
  if (!match) return null;
  return { key: match[1], value: stripQuotes(match[2].trim()) };
}

function stripQuotes(value) {
  const quote = value.at(0);
  const quoted = value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote);
  return quoted ? value.slice(1, -1) : value;
}
