import { render, screen } from "@testing-library/react";
import { Header } from "./Header";

describe("Header", () => {
  it("links the logo to the homepage", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: /smart eyewear/i })).toHaveAttribute("href", "/");
  });

  it("renders real links for Catalog and Login", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  });

  it("shows Try Face Analysis as disabled and non-navigating", () => {
    render(<Header />);

    expect(screen.queryByRole("link", { name: /try face analysis/i })).not.toBeInTheDocument();
    expect(screen.getByText(/try face analysis/i)).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the cart icon as a disabled button", () => {
    render(<Header />);

    expect(screen.getByRole("button", { name: /cart/i })).toBeDisabled();
  });
});
