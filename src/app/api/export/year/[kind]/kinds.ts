/// The export dispatch table's key space, kept apart from the builders
/// themselves and the Prisma/date/csv imports those pull in, so the guard below
/// can be reasoned about — and imported — without dragging in `next-auth` by
/// way of `route.ts`.
export const EXPORT_KINDS = ["register", "attendance", "marks"] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];

/// A plain `BUILDERS[kind]` object lookup walks the prototype chain:
/// `__proto__` resolves to `Object.prototype` (not a function, so the route
/// 500s instead of 400ing) and `constructor` or `toString` resolve to real
/// functions nobody registered here, which then run and return 200 with
/// garbage. Checking membership in a fixed array never touches the prototype
/// chain, so every one of those falls through to "unknown kind" like any
/// other bad input.
export function isExportKind(kind: string): kind is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(kind);
}
