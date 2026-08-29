"use client";

import { useState, type ReactNode } from "react";
import { TabPanels } from "@/components/ui/tab-panels";
import { Modal } from "@/components/ui/modal";
import { GradeOfferings } from "./grade-offerings";
import { OfferingDetail, type OfferingRow } from "./subjects-view";

// Subjects and their per-grade offerings are two jobs, so they get a tab each
// rather than one page that has to be scrolled past.

export function SubjectsWorkspace({
  subjectsTab,
  addOffering,
  offerings,
  yearName,
}: {
  subjectsTab: ReactNode;
  /// Rendered above the grade rail; server-composed, so it arrives as a node.
  addOffering: ReactNode;
  offerings: OfferingRow[];
  yearName: string;
}) {
  const [editing, setEditing] = useState<OfferingRow | null>(null);

  return (
    <>
      <TabPanels
        tabs={[
          { value: "subjects", label: "Subjects", content: subjectsTab },
          {
            value: "offerings",
            label: "Curriculum",
            content: (
              <>
                {addOffering}
                <GradeOfferings
                  rows={offerings}
                  yearName={yearName}
                  renderDetail={(row) => setEditing(row)}
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        open={editing !== null}
        title={editing ? `${editing.gradeName} · ${editing.subjectName}` : ""}
        onClose={() => setEditing(null)}
      >
        {/* Keyed per offering: the panel holds its own state, and opening a
            second row must not inherit the first one's. */}
        {editing ? (
          <OfferingDetail
            key={editing.id}
            row={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}
