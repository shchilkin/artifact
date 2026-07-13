export function emptyTableState(itemCount: number, title: string, message: string) {
  if (itemCount > 0) return undefined;
  return { title, message };
}
