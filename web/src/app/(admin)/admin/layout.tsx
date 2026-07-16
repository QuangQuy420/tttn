"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { removeAccessToken } from "@/lib/auth/session";

const NAV_ITEMS = [
  { label: "Tổng quan", href: "#" },
  { label: "Sản phẩm", href: "/admin/products" },
  { label: "Đơn hàng", href: "#" },
  { label: "Khách hàng", href: "#" },
  { label: "Cài đặt", href: "#" },
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

  return (
      <AdminGuard>
        <div className="admin-shell">
          <aside className="admin-sidebar">
            <div className="admin-sidebar__brand">
              SMART EYEWEAR
              <div className="admin-sidebar__subtitle">
                QUẢN TRỊ
              </div>
            </div>

            <nav className="admin-sidebar__nav">
              {NAV_ITEMS.map((item) => {
                const active =
                    item.href !== "#" &&
                    pathname.startsWith(item.href);

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
                  onClick={handleLogout}
              >
                Đăng xuất
              </button>
            </div>
          </aside>

          <div className="admin-main">
            {children}
          </div>
        </div>
      </AdminGuard>
  );
}