import { existsSync, readFileSync } from 'node:fs';

export function loadEnvFiles(paths) {
  for (const path of paths) {
    loadEnvFile(path);
  }
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const entry of readFileSync(path, 'utf8').split(/\r?\n/).map(parseEnvLine)) {
    if (!shouldApplyEnvEntry(entry)) continue;
    process.env[entry.key] = entry.value;
  }
}

function shouldApplyEnvEntry(entry) {
  return Boolean(entry) && process.env[entry.key] === undefined;
}

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/i);
  if (!match) return null;
  return { key: match[1], value: stripQuotes(match[2].trim()) };
}

function stripQuotes(value) {
  const quote = value.at(0);
  return isQuotedValue(value, quote) ? value.slice(1, -1) : value;
}

function isQuotedValue(value, quote) {
  return value.length >= 2 && isSupportedQuote(quote) && value.endsWith(quote);
}

function isSupportedQuote(quote) {
  return quote === '"' || quote === "'";
}
