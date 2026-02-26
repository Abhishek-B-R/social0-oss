import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoPlugPanel } from "@/components/autoplug/AutoPlugPanel";

describe("AutoPlugPanel", () => {
  const xAccount = {
    id: "x-1",
    platform: "twitter_x",
    platformUsername: "testuser",
    profileImageUrl: null,
  };
  const instagramAccount = { id: "ig-1", platform: "instagram" };
  const allAccounts = [xAccount, instagramAccount];

  it("renders nothing when no X account in selectedAccountIds", () => {
    const { container } = render(
      <AutoPlugPanel
        selectedAccountIds={[instagramAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders with Auto-Plug heading when X account selected", () => {
    render(
      <AutoPlugPanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("🔌 Auto-Plug")).toBeInTheDocument();
  });

  it("default metric is likes", async () => {
    render(
      <AutoPlugPanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    const likesButton = screen.getByRole("button", { name: /Likes/i });
    expect(likesButton).toHaveAttribute(
      "class",
      expect.stringContaining("bg-background"),
    );
  });

  it("clicking Retweets pill switches metricType", async () => {
    const onChange = jest.fn();
    render(
      <AutoPlugPanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    await userEvent.click(screen.getByRole("button", { name: /Retweets/i }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ metricType: "retweets" }),
    );
  });

  it("typing in threshold input updates value", async () => {
    render(
      <AutoPlugPanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    const thresholdInput = screen.getByRole("spinbutton");
    fireEvent.change(thresholdInput, { target: { value: "250" } });
    expect(thresholdInput).toHaveValue(250);
  });

  it("plug comment capped at 280 chars, counter shows 280/280", async () => {
    render(
      <AutoPlugPanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    const textarea = screen.getByPlaceholderText(/Your reply tweet/);
    const long = "a".repeat(281);
    await userEvent.type(textarea, long);
    expect(screen.getByText("280/280")).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value.length).toBeGreaterThanOrEqual(280);
  });

  it("onChange fires with correct metricType, threshold, plugComment", async () => {
    const onChange = jest.fn();
    render(
      <AutoPlugPanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    await userEvent.type(screen.getByPlaceholderText(/Your reply tweet/), "My reply");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metricType: "likes",
        threshold: expect.any(Number),
        plugComment: "My reply",
      }),
    );
  });
});
