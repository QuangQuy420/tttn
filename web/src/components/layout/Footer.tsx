// FR12: shield icon + face-photo trust note, shown on every page. The copyright line is kept as
// a smaller secondary line underneath rather than dropped (see plan Q6).
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__trust">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-4z" />
        </svg>
        <p>Your face photos are never stored or shared — they are used only for instant analysis.</p>
      </div>
      <p className="site-footer__copyright">&copy; {new Date().getFullYear()} Smart Eyewear</p>
    </footer>
  );
}
