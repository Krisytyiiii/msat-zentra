"use client";

/**
 * Teacher-shell alias for the shared in-page search field.
 *
 * The field now lives in `components/ui/search-field` so every desk renders the
 * exact same shell; the teacher shell keeps this import path so the existing
 * pages (and the "one search field" rule) don't churn.
 */
export {
  SearchField as TeacherSearchField,
  searchEmptyMessage,
} from "@/components/ui/search-field";
