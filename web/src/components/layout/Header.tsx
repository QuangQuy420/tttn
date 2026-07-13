import Link from "next/link";

// Simple, self-contained header. Kept deliberately minimal so it's easy to extend once
// the other dev's user-service auth is live (e.g. swapping "Login"/"Register" for a user
// menu) without needing to redesign this component.
export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="site-logo">
        SMART EYEWEAR
      </Link>
      <nav className="site-nav" aria-label="Primary">
        <Link href="/" className="site-nav__link">
          Catalog
        </Link>
        <Link href="/face-analysis" className="site-nav__link">
          Try Face Analysis
        </Link>
        <Link href="#" className="site-nav__link">
          About
        </Link>
      </nav>
      <div className="site-header__actions">
        <Link href="/login" className="site-nav__link">
          Login
        </Link>
        {/* No cart feature exists yet (see plan Q4/Q5) — shown, disabled. */}
        <button
          type="button"
          className="cart-icon-button"
          disabled
          title="Coming soon"
          aria-label="Cart (coming soon)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M3 6h18l-1.5 12a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2L3 6z" />
            <path d="M8 10V6a4 4 0 1 1 8 0v4" />
          </svg>
          <span className="cart-icon-button__badge">0</span>
        </button>
      </div>
    </header>
  );
}
