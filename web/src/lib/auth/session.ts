const ACCESS_TOKEN_KEY = "accessToken";

function dispatchAuthChange(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-change"));
    }
}

export function saveAccessToken(token: string): void {
    if (typeof window === "undefined") return;

    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    dispatchAuthChange();
}

export function getAccessToken(): string | null {
    if (typeof window === "undefined") return null;

    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function removeAccessToken(): void {
    if (typeof window === "undefined") return;

    localStorage.removeItem(ACCESS_TOKEN_KEY);
    dispatchAuthChange();
}

// Pages a signed-out visitor uses on purpose: an expired token is cleared there but the visitor
// is not redirected, so e.g. the `?token=` of /reset-password is not lost.
const SIGNED_OUT_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

// Central handler for an expired or revoked token (AC6): called by apiFetch when a request that
// carried `Bearer <token>` got 401. Clears the token (fires `auth-change`, so the Header switches
// to the signed-out state) and sends the user to /login. Does nothing unless `token` is still the
// stored one — so a late 401 from an in-flight request can neither delete a token from a newer
// login nor replace a URL set on purpose (e.g. `/login?notice=password-changed`).
export function expireSession(token: string): void {
    if (typeof window === "undefined") return;
    if (getAccessToken() !== token) return;

    removeAccessToken();
    if (!SIGNED_OUT_PAGES.includes(window.location.pathname)) {
        window.location.replace("/login");
    }
}
