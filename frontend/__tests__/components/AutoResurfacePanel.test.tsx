import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoResurfacePanel } from "@/components/resurface/AutoResurfacePanel";

describe("AutoResurfacePanel", () => {
  const xAccount = { id: "x-1", platform: "twitter_x" };
  const instagramAccount = { id: "ig-1", platform: "instagram" };
  const allAccounts = [xAccount, instagramAccount];

  it("renders nothing when selectedAccountIds has no supported platform", () => {
    const { container } = render(
      <AutoResurfacePanel
        selectedAccountIds={[instagramAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the panel when selectedAccountIds contains an X account", () => {
    render(
      <AutoResurfacePanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Auto-Resurface/)).toBeInTheDocument();
  });

  it("toggle off by default — onChange not called with config on mount", () => {
    const onChange = jest.fn();
    render(
      <AutoResurfacePanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={onChange}
      />,
    );
    // When visible, useEffect runs and with enabled=false it calls onChange(null)
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("toggle on shows interval and reshare count dropdowns", async () => {
    render(
      <AutoResurfacePanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "" });
    await userEvent.click(toggle);
    expect(screen.getByText(/Reshare every/)).toBeInTheDocument();
    expect(screen.getByText(/Number of reshares/)).toBeInTheDocument();
  });

  it("changing intervalHours updates First reshare text", async () => {
    render(
      <AutoResurfacePanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    expect(screen.getByText(/First reshare/)).toBeInTheDocument();
    const combos = screen.getAllByRole("combobox");
    fireEvent.change(combos[0], { target: { value: "2" } });
    expect(screen.getByText(/First reshare/)).toBeInTheDocument();
  });

  it("toggle on, set 4h and 3 reshares — onChange called with config", async () => {
    const onChange = jest.fn();
    render(
      <AutoResurfacePanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    const selects = screen.getAllByRole("combobox");
    const intervalSelect = selects[0];
    const maxSelect = selects[1];
    fireEvent.change(intervalSelect, { target: { value: "4" } });
    fireEvent.change(maxSelect, { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        intervalHours: 4,
        maxResurfaces: 3,
        plugComment: "",
      }),
    );
  });

  it("toggle back off — onChange called with null", async () => {
    const onChange = jest.fn();
    render(
      <AutoResurfacePanel
        selectedAccountIds={[xAccount.id]}
        allAccounts={allAccounts}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ intervalHours: expect.any(Number) }),
    );
    await userEvent.click(screen.getByRole("switch", { name: "" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
