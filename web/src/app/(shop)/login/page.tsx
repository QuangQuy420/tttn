import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
    return (
        <main className="auth-page">
            <section
                className="auth-card"
                aria-labelledby="login-heading"
            >
                <p className="auth-card__eyebrow">
                    Chào mừng trở lại
                </p>

                <h1
                    id="login-heading"
                    className="auth-card__title"
                >
                    Đăng nhập
                </h1>

                <p className="auth-card__subtitle">
                    Đăng nhập để quản lý hồ sơ và trải nghiệm mua sắm.
                </p>

                {/* LoginForm reads `?notice=` via useSearchParams(), which Next.js requires to
                    sit inside a Suspense boundary. */}
                <Suspense fallback={null}>
                    <LoginForm />
                </Suspense>

                <div className="auth-card__footer">
                    Chưa có tài khoản?{" "}
                    <Link href="/register">
                        Đăng ký ngay
                    </Link>
                </div>
            </section>
        </main>
    );
}