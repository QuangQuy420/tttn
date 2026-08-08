"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, getMyProfile } from "@/lib/api";
import { getAccessToken, removeAccessToken } from "@/lib/auth/session";
import type { UserProfile } from "@/types/user";

const CATALOG_PERMISSION = "catalog:manage";
const AdminAccessContext = createContext<UserProfile | null>(null);

export function useAdminProfile(): UserProfile | null {
  return useContext(AdminAccessContext);
}

function hasAdminAccess(profile: UserProfile): boolean {
  return profile.roles.some((role) => role.toUpperCase() === "ADMIN");
}

function canOpenPath(profile: UserProfile, pathname: string): boolean {
  if (hasAdminAccess(profile)) return true;
  const isCatalogPath = pathname === "/admin/brands" || pathname === "/admin/categories";
  return isCatalogPath && profile.permissions.includes(CATALOG_PERMISSION);
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function verifyAccess() {
      const token = getAccessToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await getMyProfile(token);
        if (!canOpenPath(response.data, pathname)) {
          router.replace("/login");
          return;
        }
        setProfile(response.data);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          removeAccessToken();
        }
        router.replace("/login");
      } finally {
        setChecking(false);
      }
    }

    void verifyAccess();
  }, [pathname, router]);

  if (checking) {
    return <main className="admin-auth-check"><p>Đang kiểm tra quyền quản trị...</p></main>;
  }

  if (!profile) return null;

  return <AdminAccessContext.Provider value={profile}>{children}</AdminAccessContext.Provider>;
}
