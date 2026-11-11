"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { ApiError, getMyProfile } from "@/lib/api";
import { defaultAdminPath } from "@/lib/auth/admin-access";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";

// "/" only matches the exact catalog root; every other tab also covers its sub-routes
// (e.g. "/admin/orders" should still highlight "Quản trị").
function isNavLinkActive(pathname: string, href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
    const router = useRouter();
    const pathname = usePathname();
    const menuRef = useRef<HTMLDivElement>(null);

    // Starts false to match the server-rendered markup (no `window` there), then syncs the
    // real value in the effect below — reading localStorage during the initializer instead
    // would make the client's first render diverge from the server's and trigger a hydration
    // mismatch.
    const [authenticated, setAuthenticated] = useState(false);

    // Permissions are only known once we've fetched the profile — null covers both "not
    // logged in" and "not fetched yet", so the Admin tab (FR7) stays hidden until we're sure.
    const [permissions, setPermissions] = useState<string[] | null>(null);

    // Same fallback convention as profile/page.tsx: fullName if set, else username.
    const [displayName, setDisplayName] = useState<string | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);

    // useCart() reads the access token itself and no-ops (empty cart, no fetch) when there
    // isn't one, so it's safe to call unconditionally here — it already skips cart endpoint
    // calls for a logged-out user.
    const { totalQuantity } = useCart();

    // First admin page the user's permissions open (AC7); null hides the "Quản trị" link.
    const adminHref = permissions ? defaultAdminPath(permissions) : null;

    useEffect(() => {
        function syncAuthState() {
            const token = getAccessToken();
            setAuthenticated(Boolean(token));

            if (!token) {
                setPermissions(null);
                setDisplayName(null);
                return;
            }

            void getMyProfile(token)
                .then((response) => {
                    setPermissions(response.data.permissions ?? null);
                    setDisplayName(response.data.fullName || response.data.username);
                })
                // A 401 (expired / revoked token) is handled by apiFetch: it clears the token,
                // which fires `auth-change` and re-runs this sync as signed out (AC6).
                .catch((error) => {
                    if (!(error instanceof ApiError)) throw error;
                    setPermissions(null);
                    setDisplayName(null);
                });
        }

        function handleOutsideClick(event: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                setMenuOpen(false);
            }
        }

        syncAuthState();

        window.addEventListener("auth-change", syncAuthState);
        document.addEventListener("mousedown", handleOutsideClick);

        return () => {
            window.removeEventListener("auth-change", syncAuthState);
            document.removeEventListener(
                "mousedown",
                handleOutsideClick,
            );
        };
    }, []);

    function handleLogout() {
        removeAccessToken();
        setAuthenticated(false);
        setPermissions(null);
        setDisplayName(null);
        setMenuOpen(false);
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="site-header">
            <Link href="/" className="site-logo">
                SMART EYEWEAR
            </Link>

            <nav className="site-nav" aria-label="Điều hướng chính">
                <Link
                    href="/"
                    className={`site-nav__link${isNavLinkActive(pathname, "/") ? " site-nav__link--active" : ""}`}
                    aria-current={isNavLinkActive(pathname, "/") ? "page" : undefined}
                >
                    Sản phẩm
                </Link>

                <Link
                    href="/face-analysis"
                    className={`site-nav__link${isNavLinkActive(pathname, "/face-analysis") ? " site-nav__link--active" : ""}`}
                    aria-current={isNavLinkActive(pathname, "/face-analysis") ? "page" : undefined}
                >
                    Phân tích khuôn mặt
                </Link>

                <Link
                    href="/try-on"
                    className={`site-nav__link${isNavLinkActive(pathname, "/try-on") ? " site-nav__link--active" : ""}`}
                    aria-current={isNavLinkActive(pathname, "/try-on") ? "page" : undefined}
                >
                    Thử Kính
                </Link>

                <Link
                    href="/wishlist"
                    className={`site-nav__link${isNavLinkActive(pathname, "/wishlist") ? " site-nav__link--active" : ""}`}
                    aria-current={isNavLinkActive(pathname, "/wishlist") ? "page" : undefined}
                >
                    Yêu thích
                </Link>

                {authenticated && adminHref && (
                    <Link
                        href={adminHref}
                        className={`site-nav__link${isNavLinkActive(pathname, "/admin") ? " site-nav__link--active" : ""}`}
                        aria-current={isNavLinkActive(pathname, "/admin") ? "page" : undefined}
                    >
                        Quản trị
                    </Link>
                )}
            </nav>

            <div className="site-header__actions">
                {authenticated ? (
                    <div
                        className="account-menu"
                        ref={menuRef}
                    >
                        <button
                            type="button"
                            className="account-menu__trigger"
                            onClick={() =>
                                setMenuOpen((current) => !current)
                            }
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                        >
              <span className="account-menu__avatar">
                {(displayName ?? "U").charAt(0).toUpperCase()}
              </span>

                            <span className="account-menu__label">
                {displayName ?? "Tài khoản"}
              </span>

                            <svg
                                className={`account-menu__chevron ${
                                    menuOpen
                                        ? "account-menu__chevron--open"
                                        : ""
                                }`}
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                            >
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </button>

                        {menuOpen && (
                            <div
                                className="account-menu__dropdown"
                                role="menu"
                            >
                                <Link
                                    href="/profile"
                                    className="account-menu__item"
                                    role="menuitem"
                                    onClick={() => setMenuOpen(false)}
                                >
                  <span className="account-menu__icon">
                    👤
                  </span>
                                    Thông tin cá nhân
                                </Link>

                                <Link
                                    href="/orders"
                                    className="account-menu__item"
                                    role="menuitem"
                                    onClick={() => setMenuOpen(false)}
                                >
                  <span className="account-menu__icon">
                    📦
                  </span>
                                    Đơn hàng của tôi
                                </Link>

                                <Link
                                    href="/change-password"
                                    className="account-menu__item"
                                    role="menuitem"
                                    onClick={() => setMenuOpen(false)}
                                >
                  <span className="account-menu__icon">
                    🔒
                  </span>
                                    Đổi mật khẩu
                                </Link>

                                <div className="account-menu__divider" />

                                <button
                                    type="button"
                                    className="account-menu__item account-menu__item--danger"
                                    onClick={handleLogout}
                                    role="menuitem"
                                >
                  <span className="account-menu__icon">
                    ↪
                  </span>
                                    Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="auth-actions">
                        <Link
                            href="/login"
                            className="site-nav__link"
                        >
                            Đăng nhập
                        </Link>

                        <Link
                            href="/register"
                            className="header-register-button"
                        >
                            Đăng ký
                        </Link>
                    </div>
                )}

                <Link
                    href="/cart"
                    className="cart-icon-button"
                    aria-label="Giỏ hàng"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                    >
                        <path d="M3 6h18l-1.5 12a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2L3 6z" />
                        <path d="M8 10V6a4 4 0 1 1 8 0v4" />
                    </svg>

                    <span className="cart-icon-button__badge">
            {totalQuantity}
          </span>
                </Link>
            </div>
        </header>
    );
}
