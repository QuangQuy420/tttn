"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";

export function Header() {
    const router = useRouter();
    const menuRef = useRef<HTMLDivElement>(null);

    // Starts false to match the server-rendered markup (no `window` there), then syncs the
    // real value in the effect below — reading localStorage during the initializer instead
    // would make the client's first render diverge from the server's and trigger a hydration
    // mismatch.
    const [authenticated, setAuthenticated] = useState(false);

    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        function syncAuthState() {
            setAuthenticated(Boolean(getAccessToken()));
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
        setMenuOpen(false);
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="site-header">
            <Link href="/" className="site-logo">
                SMART EYEWEAR
            </Link>

            <nav className="site-nav" aria-label="Primary">
                <Link href="/" className="site-nav__link">
                    Sản phẩm
                </Link>

                <Link
                    href="/face-analysis"
                    className="site-nav__link"
                >
                    Phân tích khuôn mặt
                </Link>

                <Link href="/about" className="site-nav__link">
                    About
                </Link>
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

                <button
                    type="button"
                    className="cart-icon-button"
                    disabled
                    title="Coming soon"
                    aria-label="Cart (coming soon)"
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
            0
          </span>
                </button>
            </div>
        </header>
    );
}