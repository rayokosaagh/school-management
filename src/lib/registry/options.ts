import type { SelectOption } from "@/components/ui/select";

// Dropdown choices that appear in more than one form, kept in one place so the
// wording cannot drift between the add form and the edit panel.

export const GENDER_OPTIONS: SelectOption[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

export const STUDENT_STATUS_OPTIONS: SelectOption[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "LEFT", label: "Left" },
  { value: "GRADUATED", label: "Graduated" },
];

export const RELATION_OPTIONS: SelectOption[] = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "GUARDIAN", label: "Guardian" },
];

export function sectionOptions(
  sections: { id: number; name: string; grade: { name: string } }[],
): SelectOption[] {
  return sections.map((s) => ({
    value: String(s.id),
    label: `${s.grade.name} ${s.name}`,
  }));
}

export const CONDUCT_KIND_OPTIONS: SelectOption[] = [
  { value: "MERIT", label: "Merit" },
  { value: "DEMERIT", label: "Demerit" },
];

export const ACTIVITY_LEVEL_OPTIONS: SelectOption[] = [
  { value: "PARTICIPATED", label: "Participated" },
  { value: "PLACED", label: "Placed" },
  { value: "WON", label: "Won" },
];
