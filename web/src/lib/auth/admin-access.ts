// Permission-based access to the admin area (AC7): one table of admin pages and the
// permissions each one needs (all of them). Used by AdminGuard (page access), the admin
// sidebar and the Header "Quản trị" link, so a role that is not named ADMIN but holds the
// right permissions sees exactly the pages its API calls will accept. Permissions mirror the
// `@RequirePermission(...)` decorators on the api-gateway routes each page calls.

export interface AdminPage {
  label: string;
  href: string;
  permissions: string[];
}

const DASHBOARD_HREF = "/admin";

// Sidebar order. The dashboard ("/admin") matches exactly and opens for anyone holding at least
// one admin permission; every other entry also covers its sub-routes (`products/[id]/edit`,
// `saga-logs/[date]/[orderId]`, ...).
export const ADMIN_PAGES: AdminPage[] = [
  { label: "Tổng quan", href: DASHBOARD_HREF, permissions: [] },
  { label: "Sản phẩm", href: "/admin/products", permissions: ["product:manage"] },
  { label: "Đánh giá", href: "/admin/reviews", permissions: ["product:manage"] },
  { label: "Đơn hàng", href: "/admin/orders", permissions: ["order:manage"] },
  { label: "Nhật ký xử lý đơn hàng", href: "/admin/saga-logs", permissions: ["order:manage"] },
  { label: "Khách hàng", href: "/admin/users", permissions: ["user:manage-roles", "role:manage"] },
  { label: "Vai trò", href: "/admin/roles", permissions: ["role:manage"] },
  { label: "Cài đặt", href: "/admin/settings", permissions: ["saga-settings:manage"] },
  { label: "Model AI", href: "/admin/ai-models", permissions: ["order:manage"] },
  { label: "Hành vi người dùng", href: "/admin/analytics", permissions: ["order:manage"] },
  { label: "Thương hiệu", href: "/admin/brands", permissions: ["catalog:manage"] },
  { label: "Danh mục", href: "/admin/categories", permissions: ["catalog:manage"] },
];

const ADMIN_PERMISSIONS = new Set(ADMIN_PAGES.flatMap((page) => page.permissions));

export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}

// True when the user holds at least one permission that opens an admin page.
export function hasAnyAdminAccess(permissions: readonly string[]): boolean {
  return permissions.some((permission) => ADMIN_PERMISSIONS.has(permission));
}

function canOpenPage(permissions: readonly string[], page: AdminPage): boolean {
  if (page.href === DASHBOARD_HREF) return hasAnyAdminAccess(permissions);
  return page.permissions.every((permission) => permissions.includes(permission));
}

function matchesPath(page: AdminPage, pathname: string): boolean {
  if (page.href === DASHBOARD_HREF) return pathname === DASHBOARD_HREF;
  return pathname === page.href || pathname.startsWith(`${page.href}/`);
}

// Whether the user may open this admin pathname. A path outside the table (a future or
// mistyped admin URL) only needs some admin permission, like the dashboard.
export function canOpenAdminPath(permissions: readonly string[], pathname: string): boolean {
  const page = ADMIN_PAGES.find((candidate) => matchesPath(candidate, pathname));
  if (!page) return hasAnyAdminAccess(permissions);
  return canOpenPage(permissions, page);
}

// Sidebar entries the user can open.
export function visibleAdminPages(permissions: readonly string[]): AdminPage[] {
  return ADMIN_PAGES.filter((page) => canOpenPage(permissions, page));
}

// Where the "Quản trị" link and a refused admin URL send the user: the first non-dashboard page
// they can open (the dashboard may show no cards for a narrow role), or null without access.
export function defaultAdminPath(permissions: readonly string[]): string | null {
  const page = ADMIN_PAGES.find(
    (candidate) => candidate.href !== DASHBOARD_HREF && canOpenPage(permissions, candidate),
  );
  return page?.href ?? null;
}
