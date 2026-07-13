import Link from "next/link";

// Admin shell (see .design/Admin Products.dc.html): dark sidebar + main content area, no site
// Header/Footer. Only "Sản phẩm" is a real link — the rest of the nav stays inert (href="#"),
// exactly as drawn in the mockup (T16). No auth guard: edge JWT verification is deferred
// pending user-service, see .planning/2026-07-11-admin-product-management.md Risks & dependencies.
const NAV_ITEMS = [
  { label: "Tổng quan", href: "#", active: false },
  { label: "Sản phẩm", href: "/admin/products", active: true },
  { label: "Đơn hàng", href: "#", active: false },
  { label: "Khách hàng", href: "#", active: false },
  { label: "Cài đặt", href: "#", active: false },
];

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          SMART EYEWEAR
          <div className="admin-sidebar__subtitle">QUẢN TRỊ</div>
        </div>
        <nav className="admin-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`admin-sidebar__link${item.active ? " admin-sidebar__link--active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
