import type { PageParams } from "@/types/api";

// Builds the `?page=&limit=` query string shared by every list call ("" when neither is set).
export function pageQuery(params: PageParams = {}): string {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}
