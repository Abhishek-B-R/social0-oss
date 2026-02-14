"use client";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DOTS = [2, 5, 8, 12, 15, 19, 22, 25];

export function CalendarMockup() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-lg p-4 max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-900">March 2025</span>
        <span className="text-gray-400 text-xs">&lt; &gt;</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-2">
        {DAYS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-medium text-gray-400 py-1"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: 35 }).map((_, i) => {
          const day = i >= 2 && i <= 32 ? i - 1 : 0;
          const hasDot = DOTS.includes(day);
          const isScheduled = day === 14;
          return (
            <div
              key={i}
              className={`aspect-square rounded flex items-center justify-center text-xs ${
                isScheduled
                  ? "bg-emerald-600 text-white font-semibold"
                  : "text-gray-600"
              } ${day === 0 ? "invisible" : ""}`}
            >
              {day > 0 ? (
                <span className="relative">
                  {day}
                  {hasDot && !isScheduled && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-600" />
                  )}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <span className="w-2 h-2 rounded-full bg-emerald-600" />
        <span className="text-xs text-gray-500">Scheduled posts</span>
      </div>
    </div>
  );
}
