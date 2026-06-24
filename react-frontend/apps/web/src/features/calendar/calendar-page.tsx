import { useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CONTENT_TYPES } from "@/lib/content-types";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

type CalendarView = "day" | "week" | "month";

export function CalendarPage() {
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(new Date());

  const rangeStart =
    view === "month"
      ? startOfWeek(startOfMonth(cursor))
      : view === "week"
        ? startOfWeek(cursor)
        : cursor;
  const rangeEnd =
    view === "month"
      ? endOfWeek(endOfMonth(cursor))
      : view === "week"
        ? endOfWeek(cursor)
        : cursor;

  const days: Date[] = [];
  for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
    days.push(d);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-text-muted">{format(cursor, "MMMM yyyy")}</p>
        </div>
        <div className="flex gap-2">
          {(["day", "week", "month"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "default" : "outline"}
              onClick={() => setView(v)}
            >
              {v[0]!.toUpperCase() + v.slice(1)}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>
      </div>

      <div
        className={
          view === "month"
            ? "grid grid-cols-7 gap-px rounded-xl border border-border bg-border overflow-hidden"
            : "space-y-2"
        }
      >
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="min-h-24 bg-bg-elevated p-2 text-sm"
            draggable
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="font-medium text-text-muted">{format(day, "d")}</div>
            <p className="mt-2 text-xs text-text-subtle">Drag posts here (wire to API)</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CreateHubPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Create post</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CONTENT_TYPES.map((t) => (
          <Link
            key={t.id}
            to="/dashboard/create/$type"
            params={{ type: t.slug }}
            className="rounded-xl border border-border bg-bg-elevated p-5 hover:border-accent"
          >
            <h3 className="font-medium">{t.label}</h3>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PostsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Posts</h1>
      <p className="text-text-muted">
        Wire to <code className="text-sm">postsService.list()</code> once /v1/posts is live on backend.
      </p>
      <div className="flex gap-2">
        <Link to="/dashboard/posts/drafts" className="text-accent hover:underline">
          Drafts
        </Link>
        <Link to="/dashboard/posts/scheduled" className="text-accent hover:underline">
          Scheduled
        </Link>
        <Link to="/dashboard/posts/posted" className="text-accent hover:underline">
          Posted
        </Link>
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-text-muted">Timezone, queue schedule, email preferences — port from SettingsClient.</p>
    </div>
  );
}
