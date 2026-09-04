/// The settings groups, in the order they are shown.
///
/// Deliberately a plain module with no "use client": the server component
/// reads these to resolve `?view=`, while the client workspace uses them to
/// render the switch. A value exported from a client module and imported by a
/// server one arrives as a client-reference proxy rather than the value itself,
/// so `SETTINGS_GROUP_IDS.includes` would not exist at runtime — a failure
/// neither typecheck nor the test suite can see.
export const SETTINGS_GROUP_IDS = ["school", "privacy", "academic", "account", "data"] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUP_IDS)[number];

export const DEFAULT_SETTINGS_GROUP: SettingsGroupId = "school";

/// Whether a `?view=` value names a real group. An unrecognised value falls
/// back to the default rather than erroring.
export function isSettingsGroupId(value: string | undefined): value is SettingsGroupId {
  return value !== undefined && (SETTINGS_GROUP_IDS as readonly string[]).includes(value);
}
