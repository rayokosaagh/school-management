import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeacherLoadView } from "./teacher-load";

describe("teacher load photos", () => {
  it("renders the saved photo and keeps initials for staff without one", () => {
    const html = renderToStaticMarkup(createElement(TeacherLoadView, {
      rows: [],
      staff: [
        { id: 1, fullName: "Asha Rai", photoId: 42 },
        { id: 2, fullName: "Ram Shah", photoId: null },
      ],
      chosen: {},
      onManage: () => {},
    }));
    expect(html).toContain('src="/api/photo/42"');
    expect(html).toContain(">RS</span>");
    expect(html).not.toContain(">AR</span>");
    expect(html).not.toContain("/api/photo/null");
  });
});
