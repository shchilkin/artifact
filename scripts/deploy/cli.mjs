import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function isDirectRun(importMetaUrl) {
  return Boolean(process.argv[1]) && fileURLToPath(importMetaUrl) === resolve(process.argv[1]);
}

export function runCli(importMetaUrl, main) {
  if (!isDirectRun(importMetaUrl)) return;

  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
