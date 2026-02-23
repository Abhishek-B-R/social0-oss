import {
  computeBulkSchedule,
  formatSchedulePreview,
} from "@/lib/bulk-schedule";

describe("computeBulkSchedule", () => {
  function todayAt(h: number, m: number): Date {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  it("returns 3 dates on 3 consecutive days at 19:00 for (3, today, 19, 0, 1, 24)", () => {
    const start = todayAt(0, 0);
    const result = computeBulkSchedule(3, start, 19, 0, 1, 24);
    expect(result).toHaveLength(3);
    expect(result[0].getHours()).toBe(19);
    expect(result[0].getMinutes()).toBe(0);
    expect(result[1].getDate()).toBe(result[0].getDate() + 1);
    expect(result[1].getHours()).toBe(19);
    expect(result[2].getDate()).toBe(result[0].getDate() + 2);
    expect(result[2].getHours()).toBe(19);
  });

  it("returns 4 slots: day1@19:00, day1@21:00, day2@19:00, day2@21:00 for (4, today, 19, 0, 2, 2)", () => {
    const start = todayAt(0, 0);
    const result = computeBulkSchedule(4, start, 19, 0, 2, 2);
    expect(result).toHaveLength(4);
    expect(result[0].getHours()).toBe(19);
    expect(result[0].getMinutes()).toBe(0);
    expect(result[1].getHours()).toBe(21);
    expect(result[1].getDate()).toBe(result[0].getDate());
    expect(result[2].getHours()).toBe(19);
    expect(result[2].getDate()).toBe(result[0].getDate() + 1);
    expect(result[3].getHours()).toBe(21);
    expect(result[3].getDate()).toBe(result[0].getDate() + 1);
  });

  it("returns single date at 10:30 today for (1, today, 10, 30, 1, 24)", () => {
    const start = todayAt(0, 0);
    const result = computeBulkSchedule(1, start, 10, 30, 1, 24);
    expect(result).toHaveLength(1);
    expect(result[0].getHours()).toBe(10);
    expect(result[0].getMinutes()).toBe(30);
    expect(result[0].getDate()).toBe(start.getDate());
  });

  it("returns empty array for (0, today, 10, 0, 1, 24)", () => {
    const start = todayAt(0, 0);
    const result = computeBulkSchedule(0, start, 10, 0, 1, 24);
    expect(result).toEqual([]);
  });

  it("returns day1@23:00, day2@23:00 for (2, today, 23, 0, 1, 1) — not 24:00", () => {
    const start = todayAt(0, 0);
    const result = computeBulkSchedule(2, start, 23, 0, 1, 1);
    expect(result).toHaveLength(2);
    expect(result[0].getHours()).toBe(23);
    expect(result[0].getMinutes()).toBe(0);
    expect(result[1].getDate()).toBe(result[0].getDate() + 1);
    expect(result[1].getHours()).toBe(23);
  });
});

describe("formatSchedulePreview", () => {
  it("returns string containing gap hours", () => {
    const out = formatSchedulePreview(3, "19:00", 2, 2);
    expect(out).toMatch(/2h apart/);
  });

  it("returns arrow-separated times", () => {
    const out = formatSchedulePreview(4, "19:00", 3, 1);
    expect(out).toMatch(/→/);
  });

  it("returns 'days' in total duration", () => {
    const out = formatSchedulePreview(5, "10:00", 2, 6);
    expect(out).toMatch(/days/);
  });

  it("returns empty string for count 0", () => {
    expect(formatSchedulePreview(0, "10:00", 1, 24)).toBe("");
  });
});
