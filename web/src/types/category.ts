// Mirrors product-service's ps_categories table (self-referencing via parentId).
// See .planning/2026-07-02-sprint-1-foundation-catalog-my-part.md "Data model".
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}
