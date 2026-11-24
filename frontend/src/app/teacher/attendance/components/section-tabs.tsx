"use client";

import { FilterTabs } from "@/components/ui/filter-tabs";

export interface SectionTab {
  id: string;
  name: string;
  gradeLevel: string | null;
}

/**
 * Section switcher for the attendance desk — the shared tab-filter shape, so
 * it reads like every other desk filter instead of a bespoke card row.
 */
export function SectionTabs({
  sections,
  activeSectionId,
  onSelect,
}: {
  sections: SectionTab[];
  activeSectionId: string | null;
  onSelect: (sectionId: string) => void;
}) {
  if (sections.length === 0) return null;

  return (
    <FilterTabs
      label="Attendance section"
      options={sections.map((section) => ({
        value: section.id,
        label: section.name,
      }))}
      value={activeSectionId ?? sections[0].id}
      onChange={onSelect}
    />
  );
}
