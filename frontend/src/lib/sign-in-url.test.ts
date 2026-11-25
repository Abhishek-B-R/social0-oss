import { describe, expect, it } from "vitest";
import { resolvePostAuthDestination } from "./sign-in-url";

describe("resolvePostAuthDestination", () => {
  it("sends new users to onboarding, except back to a free tool", () => {
    expect(resolvePostAuthDestination({ shouldOnboard: true }, "/dashboard/new?handoff=1")).toBe("/onboarding");
    expect(resolvePostAuthDestination({ shouldOnboard: true }, "/free-tools/meme-video-maker")).toBe("/free-tools/meme-video-maker");
  });
  it("sends returning users where they asked", () => {
    expect(resolvePostAuthDestination({ shouldOnboard: false }, "/dashboard/new?handoff=1")).toBe("/dashboard/new?handoff=1");
  });
});
