import { describe, expect, it } from "vitest";
import { hideableColumnIds } from "./columns";

describe("hideableColumnIds", () => {
  it("uses an explicit id when the column has one", () => {
    expect(hideableColumnIds([{ id: "actions" }])).toEqual(new Set(["actions"]));
  });

  it("derives the id from accessorKey the way TanStack does", () => {
    // TanStack replaces the dots of a deep accessor key with underscores.
    expect(hideableColumnIds([{ accessorKey: "grade.name" }])).toEqual(new Set(["grade_name"]));
    expect(hideableColumnIds([{ accessorKey: "name" }])).toEqual(new Set(["name"]));
  });

  it("prefers an explicit id over the accessorKey", () => {
    expect(hideableColumnIds([{ id: "grade", accessorKey: "grade.name" }])).toEqual(new Set(["grade"]));
  });

  it("excludes columns that may not be hidden", () => {
    expect(hideableColumnIds([{ accessorKey: "name", enableHiding: false }, { accessorKey: "born" }])).toEqual(
      new Set(["born"]),
    );
  });

  it("ignores a column with neither an id nor an accessorKey", () => {
    expect(hideableColumnIds([{}])).toEqual(new Set<string>());
  });
});
