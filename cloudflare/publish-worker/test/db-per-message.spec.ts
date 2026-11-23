/**
 * One Postgres client per queue message. The ownership check, the progress
 * events and the final result each used to open (and close) their own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, mockOpen, mockAssert, mockProcess } = vi.hoisted(() => {
  const client = { end: vi.fn(async () => undefined) };
  return {
    client,
    mockOpen: vi.fn(async () => client),
    mockAssert: vi.fn(async () => null),
    mockProcess: vi.fn(async () => undefined),
  };
});

vi.mock("../src/db", () => ({ openSql: mockOpen, withSql: vi.fn() }));
vi.mock("../src/validate-job", () => ({
  assertPublishJobAuthorized: mockAssert,
  parsePublishPlatformJob: vi.fn(),
}));
vi.mock("../src/process-platform", () => ({
  processPlatformJob: mockProcess,
  PublishRetryLaterError: class extends Error {},
}));
vi.mock("../src/job-progress-db", () => ({ recordPlatformResult: vi.fn() }));

import worker from "../src/index";

const JOB = {
  postId: "11111111-1111-4111-8111-111111111111",
  userId: "u1",
  publicationId: "22222222-2222-4222-8222-222222222222",
  connectedAccountId: "33333333-3333-4333-8333-333333333333",
  platform: "linkedin",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queue consumer database clients", () => {
  it("opens one client per message, shares it, and closes it", async () => {
    const msg = { body: JOB, attempts: 1, ack: vi.fn(), retry: vi.fn() };

    await worker.queue!(
      { queue: "social0-publish-now", messages: [msg, { ...msg, ack: vi.fn() }] } as unknown as MessageBatch,
      {} as Env,
    );

    expect(mockOpen).toHaveBeenCalledTimes(2);
    expect(mockAssert).toHaveBeenCalledWith(expect.anything(), JOB, client);
    expect(mockProcess).toHaveBeenCalledWith(JOB, expect.anything(), 1, client);
    expect(client.end).toHaveBeenCalledTimes(2);
  });

  it("closes the client when the job throws", async () => {
    mockProcess.mockRejectedValueOnce(new Error("boom"));
    const msg = { body: JOB, attempts: 1, ack: vi.fn(), retry: vi.fn() };

    await worker.queue!(
      { queue: "social0-publish-now", messages: [msg] } as unknown as MessageBatch,
      {} as Env,
    );

    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
