import React from "react";
import { render, screen } from "@testing-library/react";
import { AccountAvatar } from "@/components/AccountAvatar";

describe("AccountAvatar", () => {
  it("renders image when profileImageUrl is provided", () => {
    render(
      <AccountAvatar
        profileImageUrl="https://example.com/avatar.jpg"
        username="johndoe"
      />,
    );
    const img = screen.getByRole("img", { name: "johndoe" });
    expect(img).toHaveAttribute("src", "https://example.com/avatar.jpg");
  });

  it("renders initial from username when no profileImageUrl", () => {
    render(<AccountAvatar profileImageUrl={null} username="alice" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders initial from platform when no username or image", () => {
    render(
      <AccountAvatar profileImageUrl={undefined} platform="pinterest" />,
    );
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("renders ? when no username, platform, or image", () => {
    render(<AccountAvatar profileImageUrl={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
