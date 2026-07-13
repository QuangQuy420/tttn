import { render, screen } from "@testing-library/react";
import { Header } from "./Header";

describe("Header", () => {
  it("links the logo to the homepage", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: /smart eyewear/i })).toHaveAttribute("href", "/");
  });

  it("renders real links for Catalog, Try Face Analysis, and Login", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /try face analysis/i })).toHaveAttribute(
      "href",
      "/face-analysis",
    );
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  });

  it("shows the cart icon as a disabled button", () => {
    render(<Header />);

    expect(screen.getByRole("button", { name: /cart/i })).toBeDisabled();
  });
});
