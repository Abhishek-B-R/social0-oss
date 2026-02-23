/**
 * API auth protection: unauthenticated requests must receive 401.
 */

jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

describe("API auth protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST /api/media/upload returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/media/upload/route");
    const formData = new FormData();
    const res = await POST(new Request("http://localhost/api/media/upload", {
      method: "POST",
      body: formData,
    }));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/accounts/[id] returns 401 when unauthenticated", async () => {
    const { DELETE } = await import("@/app/api/accounts/[id]/route");
    const res = await DELETE(
      new Request("http://localhost/api/accounts/test-id", { method: "DELETE" }),
      { params: Promise.resolve({ id: "test-id" }) },
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/accounts returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/accounts/route");
    const res = await GET(new Request("http://localhost/api/accounts"));
    expect(res.status).toBe(401);
  });
});
