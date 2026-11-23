import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { getNextAvailableSlot, type QueueSlot } from "../lib/queue-utils.js";

const TZ = "America/New_York";
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function slot(overrides: Partial<QueueSlot> = {}): QueueSlot {
  return {
    id: "slot-9am",
    userId: "user-1",
    daysOfWeek: EVERY_DAY,
    hour: 9,
    minute: 0,
    isActive: true,
    ...overrides,
  };
}

/** 9:00 local on 2026-10-<day> in New York, as UTC. */
const nineAm = (day: number) =>
  fromZonedTime(`2026-10-${String(day).padStart(2, "0")}T09:00:00`, TZ);

// Mon 19 Oct 2026, 08:00 local: before that day's 9:00 slot.
const FROM = fromZonedTime("2026-10-19T08:00:00", TZ);

describe("getNextAvailableSlot", () => {
  it("returns the first occurrence when nothing is taken", () => {
    const next = getNextAvailableSlot([slot()], [], TZ, FROM);
    expect(next?.utc.toISOString()).toBe(nineAm(19).toISOString());
    expect(next?.slotId).toBe("slot-9am");
  });

  it("moves to the next day when a daily slot is taken", () => {
    const next = getNextAvailableSlot([slot()], [nineAm(19)], TZ, FROM);
    expect(next?.utc.toISOString()).toBe(nineAm(20).toISOString());
  });

  it("fills consecutive days as posts are added to the queue", () => {
    const occupied: Date[] = [];
    for (let i = 0; i < 5; i++) {
      const next = getNextAvailableSlot([slot()], occupied, TZ, FROM);
      expect(next).not.toBeNull();
      occupied.push(next!.utc);
    }
    expect(occupied.map((d) => d.toISOString())).toEqual(
      [19, 20, 21, 22, 23].map((d) => nineAm(d).toISOString()),
    );
  });

  it("skips to the slot's next weekday, not a week later", () => {
    // Mon / Wed / Fri at 9:00; Monday taken → Wednesday.
    const next = getNextAvailableSlot(
      [slot({ daysOfWeek: [1, 3, 5] })],
      [nineAm(19)],
      TZ,
      FROM,
    );
    expect(next?.utc.toISOString()).toBe(nineAm(21).toISOString());
  });

  it("interleaves several slots in time order", () => {
    const morning = slot({ id: "am" });
    const evening = slot({ id: "pm", hour: 17 });
    const fivePm = fromZonedTime("2026-10-19T17:00:00", TZ);
    const next = getNextAvailableSlot(
      [morning, evening],
      [nineAm(19), fivePm],
      TZ,
      FROM,
    );
    expect(next).toEqual({ utc: nineAm(20), slotId: "am" });
  });
});
