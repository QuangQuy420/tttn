"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminGuard, useAdminProfile } from "@/components/admin/AdminGuard";
import { removeAccessToken } from "@/lib/auth/session";

const NAV_ITEMS = [
  { label: "Tổng quan", href: "/admin" },
  { label: "Sản phẩm", href: "/admin/products" },
  { label: "Đơn hàng", href: "/admin/orders" },
  { label: "Nhật ký xử lý đơn hàng", href: "/admin/saga-logs" },
  { label: "Khách hàng", href: "/admin/users" },
  { label: "Vai trò", href: "/admin/roles" },
  { label: "Cài đặt", href: "/admin/settings" },
];

const CATALOG_NAV_ITEMS = [
  { label: "Thương hiệu", href: "/admin/brands" },
  { label: "Danh mục", href: "/admin/categories" },
];

export default function AdminLayout({
                                      children,
                                    }: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    removeAccessToken();
    router.replace("/login");
    router.refresh();
  }

  return <AdminGuard><AdminLayoutContent pathname={pathname} onLogout={handleLogout}>{children}</AdminLayoutContent></AdminGuard>;
}

function AdminLayoutContent({
  children,
  pathname,
  onLogout,
}: {
  children: React.ReactNode;
  pathname: string;
  onLogout: () => void;
}) {
  const profile = useAdminProfile();
  const isAdmin = profile?.roles.some((role) => role.toUpperCase() === "ADMIN");
  const navItems = isAdmin ? [...NAV_ITEMS, ...CATALOG_NAV_ITEMS] : CATALOG_NAV_ITEMS;

  return (
        <div className="admin-shell">
          <aside className="admin-sidebar">
            <div className="admin-sidebar__brand">
              SMART EYEWEAR
              <div className="admin-sidebar__subtitle">
                QUẢN TRỊ
              </div>
            </div>

            <nav className="admin-sidebar__nav">
              {navItems.map((item) => {
                // "/admin" (Tổng quan) is a prefix of every other admin route, so it needs an
                // exact match — otherwise it would also light up on /admin/products etc.
                const active =
                    item.href === "/admin"
                        ? pathname === "/admin"
                        : pathname.startsWith(item.href);

                return (
                    <Link
                        key={item.label}
                        href={item.href}
                        className={`admin-sidebar__link${
                            active
                                ? " admin-sidebar__link--active"
                                : ""
                        }`}
                    >
                      {item.label}
                    </Link>
                );
              })}
            </nav>

            <div className="admin-sidebar__footer">
              <Link
                  href="/"
                  className="admin-sidebar__link"
              >
                Về cửa hàng
              </Link>

              <button
                  type="button"
                  className="admin-sidebar__logout"
                  onClick={onLogout}
              >
                Đăng xuất
              </button>
            </div>
          </aside>

          <div className="admin-main">
            {children}
          </div>
        </div>
  );
}
