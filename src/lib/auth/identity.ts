// Email addresses are case-insensitive in practice, usernames here are not.
// Every email is lowercased both on the way into the database and on the way
// into a lookup, so there is exactly one stored form and the unique index can
// do the duplicate checking on its own.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}
