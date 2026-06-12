import { generateLlmsTxt } from "@/lib/content/llms";

export const dynamic = "force-static";
export const revalidate = false;

export function GET() {
  return new Response(generateLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
