import Script from "next/script";

const UMAMI_WEBSITE_ID = "361b57a2-1756-474b-ace8-e21f6029e9e3";

export function UmamiAnalytics() {
  return (
    <Script
      defer
      src="https://cloud.umami.is/script.js"
      data-website-id={UMAMI_WEBSITE_ID}
      strategy="afterInteractive"
    />
  );
}
