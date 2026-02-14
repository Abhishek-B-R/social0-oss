"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, setHours, setMinutes, addDays, isBefore, startOfDay } from "date-fns";
import "react-day-picker/style.css";

type ScheduleDateTimePickerProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
};

export function ScheduleDateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  minDate = new Date(),
}: ScheduleDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [timeValue, setTimeValue] = useState(
    value ? format(value, "HH:mm") : "09:00"
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setTimeValue(format(value, "HH:mm"));
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    const [h, m] = timeValue.split(":").map(Number);
    const combined = setMinutes(setHours(date, h ?? 0), m ?? 0);
    const safe = isBefore(combined, minDate) ? minDate : combined;
    onChange(safe);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    setTimeValue(t);
    if (!value) return;
    const [h, m] = t.split(":").map(Number);
    const combined = setMinutes(setHours(value, h ?? 0), m ?? 0);
    const safe = isBefore(combined, minDate) ? minDate : combined;
    onChange(safe);
  };

  const displayDate = value
    ? format(value, "MMM d, yyyy 'at' h:mm a")
    : placeholder;
  const defaultMonth = value && value >= minDate ? value : addDays(minDate, 1);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full min-w-[240px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
      >
        <span className="text-gray-500">📅</span>
        <span className={value ? "text-gray-900" : "text-gray-500"}>
          {displayDate}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
          <DayPicker
            mode="single"
            selected={value ?? undefined}
            onSelect={handleDaySelect}
            disabled={(date) => startOfDay(date) < startOfDay(minDate)}
            defaultMonth={defaultMonth}
            classNames={{
              root: "rdp-root",
              month: "rdp-month",
              month_caption: "flex justify-between items-center h-9 mb-4 text-sm font-semibold text-gray-900",
              nav: "flex gap-1",
              button_previous: "rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50",
              button_next: "rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50",
              weekdays: "flex",
              weekday: "w-9 text-center text-xs font-medium text-gray-500",
              week: "flex",
              day: "w-9 h-9 text-center text-sm",
              day_button: "rounded-lg hover:bg-emerald-50 focus:bg-emerald-50",
              selected: "!bg-emerald-600 !text-white hover:!bg-emerald-700",
              today: "font-semibold text-emerald-600",
              outside: "text-gray-300",
              disabled: "text-gray-300 cursor-not-allowed",
              hidden: "invisible",
            }}
          />
          <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
            <label className="text-sm font-medium text-gray-700">Time</label>
            <input
              type="time"
              value={timeValue}
              onChange={handleTimeChange}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
