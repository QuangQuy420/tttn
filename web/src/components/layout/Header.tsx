"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { ApiError, getMyProfile } from "@/lib/api";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";

// Same role-name gate as AdminGuard.tsx (see its comment) — the browser only ever sees
// role names, not permission codes, so "Quản trị" shows for the same set of roles that are
// actually let into /admin.
const ADMIN_ROLE_NAMES = ["ADMIN"];

export function Header() {
    const router = useRouter();
    const menuRef = useRef<HTMLDivElement>(null);

    // Starts false to match the server-rendered markup (no `window` there), then syncs the
    // real value in the effect below — reading localStorage during the initializer instead
    // would make the client's first render diverge from the server's and trigger a hydration
    // mismatch.
    const [authenticated, setAuthenticated] = useState(false);

    // Roles are only known once we've fetched the profile — null covers both "not logged
    // in" and "not fetched yet", so the Admin tab (FR7) stays hidden until we're sure.
    const [roles, setRoles] = useState<string[] | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);

    // useCart() reads the access token itself and no-ops (empty cart, no fetch) when there
    // isn't one, so it's safe to call unconditionally here — it already skips cart endpoint
    // calls for a logged-out user.
    const { totalQuantity } = useCart();

    useEffect(() => {
        function syncAuthState() {
            const token = getAccessToken();
            setAuthenticated(Boolean(token));

            if (!token) {
                setRoles(null);
                return;
            }

            void getMyProfile(token)
                .then((response) => {
                    setRoles(
                        response.data.roles?.map((r) => r.toUpperCase()) ?? null,
                    );
                })
                .catch((error) => {
                    if (!(error instanceof ApiError)) throw error;
                    setRoles(null);
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
        setRoles(null);
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
                <Link href="/" className="site-nav__link">
                    Sản phẩm
                </Link>

                <Link
                    href="/face-analysis"
                    className="site-nav__link"
                >
                    Phân tích khuôn mặt
                </Link>

                <Link href="/try-on" className="site-nav__link">
                    Thử Kính
                </Link>

                {authenticated && roles?.some((r) => ADMIN_ROLE_NAMES.includes(r)) && (
                    <Link href="/admin/products" className="site-nav__link">
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
                U
              </span>

                            <span className="account-menu__label">
                Tài khoản
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