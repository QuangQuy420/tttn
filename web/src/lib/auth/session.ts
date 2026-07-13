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