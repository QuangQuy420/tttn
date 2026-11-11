"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getMyProfile } from "@/lib/api";
import { canOpenAdminPath, defaultAdminPath } from "@/lib/auth/admin-access";
import { getAccessToken } from "@/lib/auth/session";
import type { UserProfile } from "@/types/user";

const AdminAccessContext = createContext<UserProfile | null>(null);

export function useAdminProfile(): UserProfile | null {
  return useContext(AdminAccessContext);
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
        setChecking(false);
        router.replace("/login");
        return;
      }

      try {
        const response = await getMyProfile(token);
        if (!canOpenAdminPath(response.data.permissions, pathname)) {
          // Signed in but without this page's permission (AC7): go to the first admin page
          // the user can open, or the storefront.
          router.replace(defaultAdminPath(response.data.permissions) ?? "/");
          return;
        }
        setProfile(response.data);
      } catch {
        // A 401 (expired / revoked token) is already handled by apiFetch (clears the token).
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

  // The profile from the previous admin page is still set while the new pathname is being
  // checked: never render a page the user cannot open, even for that moment.
  if (!profile || !canOpenAdminPath(profile.permissions, pathname)) return null;

  return <AdminAccessContext.Provider value={profile}>{children}</AdminAccessContext.Provider>;
}
