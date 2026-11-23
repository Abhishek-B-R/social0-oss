import Link from "@/components/AppLink";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
import { SeoHead } from "@/components/seo/SeoHead";

export function NotFoundPage() {
  return (
    <>
      <SeoHead
        title="Page not found | Social0"
        description="The page you requested could not be found."
        robots={{ index: false, follow: false }}
      />
      <div className="landing landing-page flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <AuthBrandHeader showNav />
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">404</p>
          <h1 className="mt-2 text-[clamp(26px,3.8vw,34px)] font-bold leading-tight tracking-tight text-foreground">
            Page not found
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            This page could not be found. It may have moved or never existed.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-[10px] bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-[#04140c] transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to home
          </Link>
        </main>
      </div>
    </>
  );
}
