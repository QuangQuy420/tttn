import { render, screen } from "@testing-library/react";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders the face-photo trust note", () => {
    render(<Footer />);

    expect(
      screen.getByText(/your face photos are never stored or shared/i),
    ).toBeInTheDocument();
  });

  it("still shows a copyright line", () => {
    render(<Footer />);

    expect(screen.getByText(/smart eyewear/i)).toBeInTheDocument();
  });
});
