"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { format, setHours, setMinutes, isBefore, startOfDay, startOfToday } from "date-fns";
import { formatDateTimeAt } from "@/lib/date-format";
import "react-day-picker/style.css";

type ScheduleDateTimePickerProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  /** When true, show times in 24h (e.g. 09:00); when false, 12h with AM/PM */
  use24HourTimeFormat?: boolean;
  /** User's date format preference (dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd) */
  dateFormat?: string | null;
};

// Helper to get current time in HH:mm format
function getCurrentTime(): string {
  const now = new Date();
  return format(now, "HH:mm");
}

// Helper to create a date with today's date and specified time
function createDateWithTime(time: string, baseDate?: Date): Date {
  const base = baseDate || startOfToday();
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) {
    const now = new Date();
    return setMinutes(setHours(base, now.getHours()), now.getMinutes());
  }
  return setMinutes(setHours(base, h), m);
}

export function ScheduleDateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  minDate = new Date(),
  maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
}: ScheduleDateTimePickerProps) {
  // Compute initial date and time
  const initialDate = useMemo(() => {
    if (value) return value;
    const today = startOfToday();
    const now = new Date();
    return setMinutes(setHours(today, now.getHours()), now.getMinutes());
  }, []);

  const initialTime = useMemo(() => {
    if (value) return format(value, "HH:mm");
    return getCurrentTime();
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value || initialDate
  );
  const [timeValue, setTimeValue] = useState(
    value ? format(value, "HH:mm") : initialTime
  );
  const [timeError, setTimeError] = useState<string | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const hasInitialized = useRef(false);

  const applyCombined = (combined: Date) => {
    const now = new Date();
    const earliestAllowed = isBefore(minDate, now) ? now : minDate;
    if (isBefore(combined, earliestAllowed)) {
      setTimeError("Scheduled time must be in the future.");
      return;
    }
    if (isBefore(maxDate, combined)) {
      setTimeError("Scheduled time must be within the next 1 year.");
      return;
    }
    setTimeError(null);
    onChange(combined);
  };

  // Auto-initialize when value is null on mount (only once)
  useEffect(() => {
    if (!hasInitialized.current && !value) {
      const today = startOfToday();
      const now = new Date();
      const initial = setMinutes(setHours(today, now.getHours()), now.getMinutes());
      // Use setTimeout to avoid calling onChange during render
      setTimeout(() => {
        onChange(initial);
      }, 0);
      setSelectedDate(initial);
      setTimeValue(format(initial, "HH:mm"));
      hasInitialized.current = true;
    }
  }, []);

  // Sync internal state when value prop changes externally
  useEffect(() => {
    if (value) {
      setSelectedDate(value);
      setTimeValue(format(value, "HH:mm"));
      hasInitialized.current = true;
    } else if (hasInitialized.current) {
      // Reset to today/now if value becomes null after initialization
      const today = startOfToday();
      const now = new Date();
      const todayWithTime = setMinutes(setHours(today, now.getHours()), now.getMinutes());
      setSelectedDate(todayWithTime);
      setTimeValue(getCurrentTime());
    }
  }, [value]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      // If date is cleared, keep today's date instead of null
      const today = startOfToday();
      setSelectedDate(today);
      const [h, m] = timeValue.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const combined = setMinutes(setHours(today, h), m);
        applyCombined(combined);
      } else {
        const now = new Date();
        const combined = setMinutes(setHours(today, now.getHours()), now.getMinutes());
        applyCombined(combined);
      }
      return;
    }

    setSelectedDate(date);
    const [h, m] = timeValue.split(":").map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      const combined = setMinutes(setHours(date, h), m);
      applyCombined(combined);
    } else {
      // If time is invalid, use current time
      const now = new Date();
      const combined = setMinutes(setHours(date, now.getHours()), now.getMinutes());
      setTimeValue(format(combined, "HH:mm"));
      applyCombined(combined);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    
    // Validate time format
    if (!newTime || !/^\d{2}:\d{2}$/.test(newTime)) {
      setTimeValue(newTime); // Still update the input for user feedback
      return;
    }

    setTimeValue(newTime);
    const [h, m] = newTime.split(":").map(Number);

    // If we have a selected date, update the combined date-time
    if (selectedDate) {
      const combined = setMinutes(setHours(selectedDate, h), m);
      applyCombined(combined);
    } else {
      // If no date selected yet, use today with the new time
      const newDate = createDateWithTime(newTime);
      setSelectedDate(newDate);
      applyCombined(newDate);
    }
  };


  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full">
      {/* Date Picker */}
      <div className="flex-1">
        <label className="block text-sm font-medium text-text mb-2">
          Date
        </label>
        <div className="relative" ref={datePickerRef}>
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={(date) =>
              startOfDay(date) < startOfDay(new Date()) ||
              startOfDay(date) > startOfDay(maxDate)
            }
            defaultMonth={selectedDate || startOfToday()}
            classNames={{
              root: "rdp-root",
              month: "rdp-month",
              month_caption: "flex justify-between items-center h-9 mb-4 text-sm font-semibold text-text",
              nav: "flex gap-1",
              button_previous: "rounded-lg border border-border bg-bg-elevated p-2 text-text-muted hover:bg-bg-muted transition-colors",
              button_next: "rounded-lg border border-border bg-bg-elevated p-2 text-text-muted hover:bg-bg-muted transition-colors",
              weekdays: "flex",
              weekday: "w-9 text-center text-xs font-medium text-text-muted",
              week: "flex",
              day: "w-9 h-9 text-center text-sm",
              day_button: "rounded-lg hover:bg-accent/10 focus:bg-accent/10 transition-colors text-text",
              selected: "!bg-accent !text-white hover:!bg-accent-hover",
              today: "font-semibold text-accent",
              outside: "text-text-muted/50",
              disabled: "text-text-muted/50 cursor-not-allowed",
              hidden: "invisible",
            }}
          />
        </div>
      </div>

      {/* Time Picker */}
      <div className="flex-1 sm:max-w-[200px]">
        <label htmlFor="time-picker" className="block text-sm font-medium text-text mb-2">
          Time
        </label>
        <input
          ref={timeInputRef}
          type="time"
          id="time-picker"
          value={timeValue}
          onChange={handleTimeChange}
          className="w-full rounded-xl border border-input bg-bg px-4 py-3 text-sm font-medium text-text shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 transition-colors [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
        />
        {timeError && (
          <p className="mt-1 text-xs text-destructive">{timeError}</p>
        )}
        {selectedDate && timeValue && (
          <p className="mt-2 text-xs text-text-muted">
            {formatDateTimeAt(
              setMinutes(setHours(selectedDate, parseInt(timeValue.split(":")[0]) || 0), parseInt(timeValue.split(":")[1]) || 0),
              { use24HourTimeFormat, dateFormat }
            )}
          </p>
        )}
      </div>
    </div>
  );
}
