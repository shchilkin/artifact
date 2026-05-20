export type LogFields = Record<string, boolean | number | string | null | undefined>;

export function logInfo(event: string, fields: LogFields = {}) {
  writeLog('info', event, fields);
}

export function logWarn(event: string, fields: LogFields = {}) {
  writeLog('warn', event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}) {
  writeLog('error', event, {
    ...fields,
    error: error instanceof Error ? error.message : String(error),
  });
}

function writeLog(level: string, event: string, fields: LogFields) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...compact(fields),
    }),
  );
}

function compact(fields: LogFields) {
  return Object.fromEntries(Object.entries(fields).filter((entry) => entry[1] !== undefined));
}
