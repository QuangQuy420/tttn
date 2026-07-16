import { render, screen } from "@testing-library/react";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders the face-photo trust note", () => {
    render(<Footer />);

    expect(
      screen.getByText(/ảnh khuôn mặt của bạn không bao giờ được lưu trữ/i),
    ).toBeInTheDocument();
  });

  it("still shows a copyright line", () => {
    render(<Footer />);

    expect(screen.getByText(/smart eyewear/i)).toBeInTheDocument();
  });
});
