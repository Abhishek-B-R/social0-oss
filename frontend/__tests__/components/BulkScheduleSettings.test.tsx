import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkScheduleSettings } from "@/components/bulk-tools/BulkScheduleSettings";

const defaultProps = {
  bulkCaption: "",
  onBulkCaptionChange: jest.fn(),
  onApplyCaption: jest.fn(),
  startDate: "2025-02-24",
  startTime: "09:00",
  videosPerDay: 1,
  gapHours: 24,
  onStartDateChange: jest.fn(),
  onStartTimeChange: jest.fn(),
  onVideosPerDayChange: jest.fn(),
  onGapHoursChange: jest.fn(),
  onApplyBulkSchedule: jest.fn(),
  schedulePreview: null,
  totalItems: 4,
  selectedAccountCount: 1,
  onScheduleAll: jest.fn(),
  scheduling: false,
};

describe("BulkScheduleSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with variant=video and shows videos label", () => {
    render(<BulkScheduleSettings {...defaultProps} variant="video" />);
    expect(
      screen.getByPlaceholderText(/caption to apply to all videos/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Apply Caption to All Videos/i }),
    ).toBeInTheDocument();
  });

  it("renders with variant=image and shows images label", () => {
    render(<BulkScheduleSettings {...defaultProps} variant="image" />);
    expect(
      screen.getByPlaceholderText(/caption to apply to all images/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Apply Caption to All Images/i }),
    ).toBeInTheDocument();
  });

  it("typing bulk caption and clicking Apply Caption to All calls onApplyCaption with value", async () => {
    const onApplyCaption = jest.fn();
    render(
      <BulkScheduleSettings
        {...defaultProps}
        variant="video"
        onApplyCaption={onApplyCaption}
      />,
    );
    const textarea = screen.getByPlaceholderText(/caption to apply to all videos/i);
    await userEvent.type(textarea, "Bulk caption");
    await userEvent.click(
      screen.getByRole("button", { name: /Apply Caption to All Videos/i }),
    );
    expect(onApplyCaption).toHaveBeenCalled();
  });

  it("changing videosPerDay to 4 and gap to 2 shows schedule preview with 4 times per day", () => {
    render(
      <BulkScheduleSettings
        {...defaultProps}
        variant="video"
        videosPerDay={4}
        gapHours={2}
        schedulePreview="Daily schedule (2h apart): 09:00 → 11:00 → 13:00 → 15:00"
      />,
    );
    expect(screen.getByText(/09:00 → 11:00 → 13:00 → 15:00/)).toBeInTheDocument();
  });

  it("Schedule All button is disabled when selectedAccountCount is 0", () => {
    render(
      <BulkScheduleSettings
        {...defaultProps}
        variant="video"
        selectedAccountCount={0}
      />,
    );
    const btn = screen.getByRole("button", { name: /Schedule All/i });
    expect(btn).toBeDisabled();
  });

  it("Schedule All button is enabled when selectedAccountCount > 0", () => {
    render(
      <BulkScheduleSettings
        {...defaultProps}
        variant="video"
        selectedAccountCount={2}
      />,
    );
    const btn = screen.getByRole("button", { name: /Schedule All/i });
    expect(btn).not.toBeDisabled();
  });
});
