import { isFullPageDocumentRequest } from "@/lib/proxy-request";

function mockReq(headers: Record<string, string>, method = "GET") {
  return {
    method,
    headers: {
      get(name: string) {
        const key = Object.keys(headers).find(
          (h) => h.toLowerCase() === name.toLowerCase(),
        );
        return key ? headers[key] : null;
      },
    },
  } as Parameters<typeof isFullPageDocumentRequest>[0];
}

describe("isFullPageDocumentRequest", () => {
  it("counts browser hard reloads", () => {
    expect(
      isFullPageDocumentRequest(
        mockReq({ accept: "text/html,application/xhtml+xml" }),
      ),
    ).toBe(true);
  });

  it("skips RSC flight requests", () => {
    expect(
      isFullPageDocumentRequest(
        mockReq({ rsc: "1", accept: "text/x-component" }),
      ),
    ).toBe(false);
  });

  it("skips router prefetches", () => {
    expect(
      isFullPageDocumentRequest(
        mockReq({
          accept: "text/html",
          "next-router-prefetch": "1",
        }),
      ),
    ).toBe(false);
  });
});
