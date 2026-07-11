export function jsonFetchResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: (name: string) => options.headers?.[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}
