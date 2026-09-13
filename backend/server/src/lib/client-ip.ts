/** Client IP for rate limiting - only trusts proxy headers when configured. */
export function clientIp(
  request: Request,
  options?: { socketIp?: string },
): string {
  const trustProxy =
    process.env.TRUST_PROXY === "true" ||
    (process.env.TRUST_PROXY !== "false" &&
      process.env.NODE_ENV === "production");

  if (trustProxy) {
    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    if (forwarded) return forwarded;
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }

  const socketIp = options?.socketIp?.trim();
  if (socketIp) return socketIp;

  return "anonymous";
}
