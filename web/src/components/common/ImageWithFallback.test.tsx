import { fireEvent, render, screen } from "@testing-library/react";
import { ImageWithFallback } from "./ImageWithFallback";

describe("ImageWithFallback", () => {
  it("renders the image by default", () => {
    render(
      <ImageWithFallback
        src="/broken.jpg"
        alt="Aviator Classic"
        className="thumb"
        placeholderClassName="thumb thumb--placeholder"
      />,
    );

    expect(screen.getByRole("img", { name: "Aviator Classic" })).toHaveAttribute(
      "src",
      "/broken.jpg",
    );
  });

  it("swaps to the placeholder once the image fails to load", () => {
    render(
      <ImageWithFallback
        src="/broken.jpg"
        alt="Aviator Classic"
        className="thumb"
        placeholderClassName="thumb thumb--placeholder"
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Aviator Classic" }));

    const placeholder = screen.getByRole("img", { name: "Aviator Classic" });
    expect(placeholder.tagName).toBe("DIV");
    expect(placeholder).toHaveClass("thumb--placeholder");
  });
});
