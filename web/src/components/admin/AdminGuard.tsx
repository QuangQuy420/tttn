"use client";

import {
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import {
    ApiError,
    getMyProfile,
} from "@/lib/api";

import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";

interface AdminGuardProps {
    children: ReactNode;
}

export function AdminGuard({
                               children,
                           }: AdminGuardProps) {
    const router = useRouter();

    const [allowed, setAllowed] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        async function verifyAdmin() {
            const token = getAccessToken();

            if (!token) {
                router.replace("/admin/login");
                return;
            }

            try {
                const response = await getMyProfile(token);

                if (
                    response.data.role?.toUpperCase() !==
                    "ADMIN"
                ) {
                    removeAccessToken();
                    router.replace("/admin/login");
                    return;
                }

                setAllowed(true);
            } catch (error) {
                if (
                    error instanceof ApiError &&
                    (error.status === 401 ||
                        error.status === 403)
                ) {
                    removeAccessToken();
                }

                router.replace("/admin/login");
            } finally {
                setChecking(false);
            }
        }

        void verifyAdmin();
    }, [router]);

    if (checking) {
        return (
            <main className="admin-auth-check">
                <p>Đang kiểm tra quyền quản trị...</p>
            </main>
        );
    }

    if (!allowed) {
        return null;
    }

    return <>{children}</>;
}