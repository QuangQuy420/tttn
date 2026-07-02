import Link from "next/link";

// Simple, self-contained header. Kept deliberately minimal so it's easy to extend once
// the other dev's user-service auth is live (e.g. swapping "Login"/"Register" for a user
// menu) without needing to redesign this component.
export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="site-logo">
        Smart Eyewear
      </Link>
      <nav className="site-nav">
        <Link href="/">Products</Link>
        <Link href="/login">Login</Link>
        <Link href="/register">Register</Link>
      </nav>
    </header>
  );
}
