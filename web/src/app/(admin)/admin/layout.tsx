"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import { AdminGuard, useAdminProfile } from "@/components/admin/AdminGuard";
import { LoadingState } from "@/components/common/LoadingState";
import { visibleAdminPages } from "@/lib/auth/admin-access";
import { removeAccessToken } from "@/lib/auth/session";

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
  // Only the pages the user's permissions open (AC7) — same table AdminGuard checks.
  const navItems = visibleAdminPages(profile?.permissions ?? []);

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
            {/* Admin list pages read `?page=` via useSearchParams() (usePageParam), which Next.js
                requires to sit inside a Suspense boundary. */}
            <Suspense fallback={<LoadingState label="Đang tải..." />}>
              {children}
            </Suspense>
          </div>
        </div>
  );
}
