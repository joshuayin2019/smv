// Matches the compact Region table, with room for a horizontal scrollbar.
export function rowsForTableHeight(height: number): number {
  return Math.min(100, Math.max(1, Math.floor((height - 31 - 42 - 16) / 30.5)));
}

export function pageForTableSize(state: { key: string; page: number }, queryKey: string, pageSize: number): number {
  const separator = state.key.lastIndexOf('&ps=');
  if (separator < 0 || state.key.slice(0, separator) !== queryKey) return 1;
  const previousSize = Number(state.key.slice(separator + 4));
  if (!Number.isFinite(previousSize) || previousSize < 1) return 1;
  return Math.floor(((state.page - 1) * previousSize) / pageSize) + 1;
}

// Arbitrary page sizes can leave a partial last page at a server browsing cap.
export function cappedPageWindow(requestedPage: number, pageSize: number, maxRows: number) {
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, Math.ceil(maxRows / pageSize)));
  const offset = (page - 1) * pageSize;
  return { page, offset, limit: Math.min(pageSize, maxRows - offset) };
}
