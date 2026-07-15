export function parseAdminBootstrapArgs(values: string[]) {
  const confirmed = values.includes('--yes');
  const pairs = values.filter((value) => value !== '--yes');
  if (pairs.length % 2 !== 0) throw new Error(`Missing value for ${pairs.at(-1)}.`);
  const args = Object.fromEntries(chunkPairs(pairs));
  return {
    userId: requiredArg(args, 'user-id'),
    confirmedUserId: requiredArg(args, 'confirm-user-id'),
    confirmed,
  };
}

function chunkPairs(values: string[]) {
  const pairs: [string, string][] = [];
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--'))
      throw new Error('Invalid Admin bootstrap arguments.');
    pairs.push([name.slice(2), value]);
  }
  return pairs;
}

function requiredArg(args: Record<string, string>, name: string) {
  const value = args[name]?.trim();
  if (!value) throw new Error(`Missing required --${name}.`);
  return value;
}
