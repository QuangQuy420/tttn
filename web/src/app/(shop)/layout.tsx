import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

// Public storefront shell: wraps every (shop) route (catalog, product detail, login, register)
// with the site Header/Footer. The (admin) route group has its own layout instead (dark sidebar,
// no site Header/Footer) — see src/app/(admin)/admin/layout.tsx.
export default function ShopLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
