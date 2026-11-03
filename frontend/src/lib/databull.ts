/**
 * DataBull visitor/session ids, read from the cookies its script sets on
 * social0.app. Server-created Dodo checkouts need these in metadata so the
 * sale is attributed to the visitor; the API runs on another subdomain and
 * never sees these host-only cookies, so the SPA forwards them in the body.
 */
function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]+)"),
  );
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function databullAttribution(): {
  databullVisitorId?: string;
  databullSessionId?: string;
} {
  return {
    databullVisitorId: readCookie("datacheap_visitor_id"),
    databullSessionId: readCookie("datacheap_session_id"),
  };
}
