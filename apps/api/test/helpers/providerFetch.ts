export function jsonFetchResponse(body: unknown, options: { ok?: boolean; status?: number } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: () => null },
    json: async () => body,
  };
}
