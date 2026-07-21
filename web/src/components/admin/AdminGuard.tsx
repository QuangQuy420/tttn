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

// Decision: gate on role *name*, not a fine-grained permission code. `GET /users/me`
// only ever returns `roles: string[]` (role names) — the one endpoint that returns actual
// permission codes (`/internal/v1/users/{id}/permissions`) is deliberately internal-only
// (NFR2, not proxied through api-gateway), so the browser has no way to ask "do I hold
// product:manage / role:manage / ...". Gating on the "ADMIN" role name is the only option
// that's actually backed by data the frontend can see, and it satisfies AC7 (existing ADMIN
// users keep admin access) without guessing at a permission the client can't verify. If a
// non-ADMIN role (e.g. a future "STAFF") should also reach /admin, add its name here.
const ADMIN_ROLE_NAMES = ["ADMIN"];

function hasAdminAccess(roles: string[] | undefined): boolean {
    if (!roles) return false;
    const upper = roles.map((role) => role.toUpperCase());
    return ADMIN_ROLE_NAMES.some((role) => upper.includes(role));
}

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
                router.replace("/login");
                return;
            }

            try {
                const response = await getMyProfile(token);

                if (!hasAdminAccess(response.data.roles)) {
                    removeAccessToken();
                    router.replace("/login");
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

                router.replace("/login");
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