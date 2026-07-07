import { fetchApi } from "@/lib/fetch-api";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatTimezoneLabel } from "@/lib/date-format";

// Mon first for display (grid columns)
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** Green circular toggle: filled green circle + white check when checked, empty circle when unchecked. */
function DayToggle({
  checked,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-pressed={checked}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-elevated ${
        checked
          ? "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500"
          : "border-border bg-transparent hover:border-border/80"
      }`}
    >
      {checked ? <Check className="h-3 w-3 stroke-[2.5]" /> : null}
    </button>
  );
}

export type QueueSlotRow = {
  id: string;
  userId: string;
  daysOfWeek: number[];
  hour: number;
  minute: number;
  isActive: boolean;
  createdAt?: string;
};

function formatTime(hour: number, minute: number, use24h: boolean): string {
  if (use24h) {
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

export function QueueScheduleSection({
  timezone,
  use24HourTimeFormat = false,
}: {
  timezone: string;
  use24HourTimeFormat?: boolean;
}) {
  const [slots, setSlots] = useState<QueueSlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addHour, setAddHour] = useState(12);
  const [addMinute, setAddMinute] = useState(0);
  const [addDaysOfWeek, setAddDaysOfWeek] = useState<number[]>([
    0, 1, 2, 3, 4, 5, 6,
  ]);
  const [showAddRow, setShowAddRow] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editHour, setEditHour] = useState(9);
  const [editMinute, setEditMinute] = useState(0);

  const fetchSlots = async () => {
    toast.dismiss();
    try {
      const res = await fetchApi("/api/queue/slots");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load queue slots");
      }
      const data = await res.json();
      setSlots(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load slots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  const handleAddTime = () => {
    setShowAddRow(true);
    setAddHour(12);
    setAddMinute(0);
    setAddDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
  };

  const toggleAddDay = (day: number) => {
    setAddDaysOfWeek((prev) => {
      const next = prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b);
      return next.length > 0 ? next : prev;
    });
  };

  const handleConfirmAdd = async () => {
    if (addDaysOfWeek.length === 0) return;
    setAdding(true);
    toast.dismiss();
    try {
      const res = await fetchApi("/api/queue/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daysOfWeek: addDaysOfWeek,
          hour: addHour,
          minute: addMinute,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add slot");
      }
      const newSlot = await res.json();
      setSlots((prev) => {
        const merged = prev.some((s) => s.id === newSlot.id)
          ? prev.map((s) => (s.id === newSlot.id ? newSlot : s))
          : [...prev, newSlot];
        return merged.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
      });
      setShowAddRow(false);
      toast.success("Posting time added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add slot");
    } finally {
      setAdding(false);
    }
  };

  const toggleDay = async (
    slotId: string,
    day: number,
    currentlyChecked: boolean,
  ) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    const nextDays = currentlyChecked
      ? slot.daysOfWeek.filter((d) => d !== day)
      : [...slot.daysOfWeek, day].sort((a, b) => a - b);
    if (nextDays.length === 0) return;
    const previous = [...slots];
    // Optimistic update: UI updates immediately
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, daysOfWeek: nextDays } : s)),
    );
    toast.dismiss();
    try {
      const res = await fetchApi(`/api/queue/slots/${slotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysOfWeek: nextDays }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
      setSlots(previous);
    }
  };

  const handleSaveTime = async (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    toast.dismiss();
    try {
      const res = await fetchApi(`/api/queue/slots/${slotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hour: editHour, minute: editMinute }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update time");
      }
      const updated = await res.json();
      setSlots((prev) => prev.map((s) => (s.id === slotId ? updated : s)));
      setEditingTimeId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update time");
    }
  };

  const handleDelete = async (id: string) => {
    const previous = [...slots];
    setSlots((prev) => prev.filter((s) => s.id !== id));
    toast.dismiss();
    try {
      const res = await fetchApi(`/api/queue/slots/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove slot");
      }
      toast.success("Posting time removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove slot");
      setSlots(previous);
    }
  };

  const activeSlots = slots.filter((s) => s.isActive !== false);

  return (
    <section
      id="queue"
      className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-text">Posting queue</h2>
      <p className="mt-2 text-sm text-text-muted">
        Weekly time slots in your timezone. When you use &quot;Next Queue
        Slot&quot; in the schedule panel, posts go to the next free slot.
      </p>
      <p className="mt-1 text-sm text-text-muted">
        Timezone:{" "}
        <span className="font-medium text-text">
          {formatTimezoneLabel(timezone)}
        </span>
      </p>

      <p className="mt-3 text-xs text-text-muted">
        Editing your schedule won&apos;t affect posts that are already
        scheduled.
      </p>

      <div className="mt-4 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-text-muted">Loading slots…</p>
        ) : (
          <>
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 text-left font-medium text-text">
                    Time
                  </th>
                  {DAYS_ORDER.map((d) => (
                    <th
                      key={d}
                      className="w-10 py-2 text-center font-medium text-text-muted"
                    >
                      {DAY_LABELS[d]}
                    </th>
                  ))}
                  <th className="w-10 py-2" aria-label="Delete" />
                </tr>
              </thead>
              <tbody>
                {activeSlots.map((slot) => (
                  <tr key={slot.id} className="border-b border-border/60">
                    <td className="py-2 pr-4">
                      {editingTimeId === slot.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={editHour}
                            onChange={(e) =>
                              setEditHour(Number(e.target.value))
                            }
                            className="rounded border border-input bg-bg px-2 py-1 text-text"
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>
                                {use24HourTimeFormat
                                  ? i.toString().padStart(2, "0")
                                  : (i % 12 || 12) + (i < 12 ? " AM" : " PM")}
                              </option>
                            ))}
                          </select>
                          <span className="text-text-muted">:</span>
                          <select
                            value={editMinute}
                            onChange={(e) =>
                              setEditMinute(Number(e.target.value))
                            }
                            className="rounded border border-input bg-bg px-2 py-1 text-text"
                          >
                            {[0, 15, 30, 45].map((m) => (
                              <option key={m} value={m}>
                                {m.toString().padStart(2, "0")}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleSaveTime(slot.id)}
                            className="text-accent hover:text-accent-hover font-medium"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTimeId(null)}
                            className="text-text-muted hover:text-text"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTimeId(slot.id);
                            setEditHour(slot.hour);
                            setEditMinute(slot.minute);
                          }}
                          className="font-medium text-text hover:text-accent hover:underline"
                        >
                          {formatTime(
                            slot.hour,
                            slot.minute,
                            use24HourTimeFormat,
                          )}
                        </button>
                      )}
                    </td>
                    {DAYS_ORDER.map((day) => {
                      const checked = slot.daysOfWeek.includes(day);
                      return (
                        <td key={day} className="py-2 text-center">
                          <div className="flex justify-center">
                            <DayToggle
                              checked={checked}
                              onToggle={() => toggleDay(slot.id, day, checked)}
                              ariaLabel={`${DAY_LABELS[day]} ${formatTime(slot.hour, slot.minute, use24HourTimeFormat)}`}
                            />
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Remove this posting time?"))
                            handleDelete(slot.id);
                        }}
                        className="text-text-muted hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20 rounded p-1"
                        aria-label={`Remove ${formatTime(slot.hour, slot.minute, use24HourTimeFormat)}`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {showAddRow && (
                  <tr className="border-b border-border/60 bg-bg-muted/30">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <select
                          value={addHour}
                          onChange={(e) => setAddHour(Number(e.target.value))}
                          className="rounded border border-input bg-bg px-2 py-1 text-text"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {use24HourTimeFormat
                                ? i.toString().padStart(2, "0")
                                : (i % 12 || 12) + (i < 12 ? " AM" : " PM")}
                            </option>
                          ))}
                        </select>
                        <span className="text-text-muted">:</span>
                        <select
                          value={addMinute}
                          onChange={(e) => setAddMinute(Number(e.target.value))}
                          className="rounded border border-input bg-bg px-2 py-1 text-text"
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>
                              {m.toString().padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    {DAYS_ORDER.map((day) => (
                      <td key={day} className="py-2 text-center">
                        <div className="flex justify-center">
                          <DayToggle
                            checked={addDaysOfWeek.includes(day)}
                            onToggle={() => toggleAddDay(day)}
                            ariaLabel={`${DAY_LABELS[day]} (new slot)`}
                          />
                        </div>
                      </td>
                    ))}
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={handleConfirmAdd}
                        disabled={adding || addDaysOfWeek.length === 0}
                        className="rounded bg-accent px-2 py-1 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                      >
                        {adding ? "Adding…" : "Add"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddRow(false)}
                        className="ml-1 text-text-muted hover:text-text"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!showAddRow && (
              <button
                type="button"
                onClick={handleAddTime}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-bg-muted/40 px-3 py-2 text-sm font-medium text-text hover:border-accent/50 hover:bg-accent/5 hover:text-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Add posting time
              </button>
            )}
            {activeSlots.length === 0 && !showAddRow && (
              <p className="mt-2 text-sm text-text-muted">
                No queue slots yet. Add a posting time above to enable
                &quot;Next Queue Slot&quot; in the schedule panel.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
