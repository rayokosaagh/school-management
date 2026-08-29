export type NameParts = {
  firstName: string;
  middleName?: string | null;
  lastName: string;
};

/// The single display name stored alongside the parts, so lists can sort and
/// search on one column without reassembling it on every query.
export function composeFullName({ firstName, middleName, lastName }: NameParts) {
  return [firstName.trim(), middleName?.trim() || null, lastName.trim()]
    .filter(Boolean)
    .join(" ");
}

export type NameError = "first" | "last";

export function validateName(parts: NameParts): NameError | null {
  if (parts.firstName.trim().length < 2) return "first";
  if (parts.lastName.trim().length < 2) return "last";
  return null;
}

export function readNameParts(formData: FormData): NameParts {
  return {
    firstName: String(formData.get("firstName") ?? "").trim(),
    middleName: String(formData.get("middleName") ?? "").trim() || null,
    lastName: String(formData.get("lastName") ?? "").trim(),
  };
}

export const NAME_MESSAGES: Record<NameError, string> = {
  first: "Enter a first name of at least two letters.",
  last: "Enter a last name of at least two letters.",
};
