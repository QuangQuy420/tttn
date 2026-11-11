import { canOpenAdminPath, defaultAdminPath, visibleAdminPages } from "./admin-access";

// A role not named ADMIN that only manages products (AC7).
const productManager = ["product:manage"];

describe("admin-access (AC7)", () => {
  it("opens the pages (and sub-routes) whose permissions the user holds, and refuses the rest (AC7)", () => {
    expect(canOpenAdminPath(productManager, "/admin")).toBe(true);
    expect(canOpenAdminPath(productManager, "/admin/products")).toBe(true);
    expect(canOpenAdminPath(productManager, "/admin/products/p1/edit")).toBe(true);
    expect(canOpenAdminPath(productManager, "/admin/reviews")).toBe(true);

    expect(canOpenAdminPath(productManager, "/admin/orders")).toBe(false);
    expect(canOpenAdminPath(productManager, "/admin/roles")).toBe(false);
    expect(canOpenAdminPath(productManager, "/admin/brands")).toBe(false);
  });

  it("requires every listed permission for a page (users needs user:manage-roles and role:manage) (AC7)", () => {
    expect(canOpenAdminPath(["user:manage-roles"], "/admin/users")).toBe(false);
    expect(canOpenAdminPath(["user:manage-roles", "role:manage"], "/admin/users")).toBe(true);
  });

  it("shows only the allowed sidebar pages and picks the first non-dashboard page as default (AC7)", () => {
    expect(visibleAdminPages(productManager).map((page) => page.href)).toEqual([
      "/admin",
      "/admin/products",
      "/admin/reviews",
    ]);
    expect(defaultAdminPath(productManager)).toBe("/admin/products");
    expect(defaultAdminPath(["order:manage"])).toBe("/admin/orders");
  });

  it("refuses every admin path for a user without admin permissions (AC7)", () => {
    const customer = ["review:create"];

    expect(canOpenAdminPath(customer, "/admin")).toBe(false);
    expect(canOpenAdminPath(customer, "/admin/products")).toBe(false);
    expect(visibleAdminPages(customer)).toEqual([]);
    expect(defaultAdminPath(customer)).toBeNull();
  });
});
