/// Keeps a page index inside the pages that actually exist. A parent can shrink
/// `rows` while the user sits on a later page; without this the slice runs past
/// the end and the table renders nothing even though `total > 0`.
export function clampPageIndex(index: number, total: number, pageSize: number): number {
  return Math.min(Math.max(0, index), Math.max(1, Math.ceil(total / pageSize)) - 1);
}
