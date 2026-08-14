
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import Image from "@/components/AppImage";

type NavLink = { href: string; label: string };

// Keep nav short — one job: stay on-page and convert
const landingNavLinks: NavLink[] = [
  { href: "/#features", label: "Product" },
  { href: "/#stories", label: "Stories" },
  { href: "/#pricing", label: "Pricing" },
];

/** On /home, same-page anchors must use /home#… so they don't hit / and redirect logged-in users. */
function landingNavHref(href: string, pathname: string | null) {
  if (pathname === "/home" && href.startsWith("/#")) {
    return `/home${href.slice(1)}`;
  }
  return href;
}

function navLinksForPath(): NavLink[] {
  return landingNavLinks;
}

export function LandingHeader() {
  const pathname = useLocation().pathname;
  const navLinks = navLinksForPath();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href={pathname === "/home" ? "/home" : "/"}
          className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="relative block h-9 w-9 shrink-0">
            <Image
              src="/logo-circular.webp"
              alt=""
              width={36}
              height={36}
              priority
              className="rounded-lg dark:hidden"
            />
            <Image
              src="/logo-dark.webp"
              alt=""
              width={36}
              height={36}
              priority
              className="absolute inset-0 hidden rounded-full border border-white/20 dark:block"
            />
          </span>
          <span className="font-logo text-[22px] font-normal tracking-tight text-foreground">
            Social0
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          <Link
            href="/features"
            className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link
            href="/tools"
            className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Tools
          </Link>
          <Link
            href="/alternatives"
            className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Compare
          </Link>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={landingNavHref(link.href, pathname)}
              className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 rounded-full border border-border bg-background px-4 py-2 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {user.image ? (
                <img
                  src={user.image}
                  alt="User profile photo"
                  className="h-7 w-7 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                  {(user.name || user.email || "U").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="max-w-[140px] truncate">
                {user.name || user.email || "Account"}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth?mode=signin"
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-emerald-500 px-5 py-2.5 text-[14px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
            >
              Start free
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-border bg-background px-6 py-4 lg:hidden">
          <nav className="flex flex-col gap-4">
            <Link
              href="/features"
              className="text-[15px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="/tools"
              className="text-[15px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Tools
            </Link>
            <Link
              href="/alternatives"
              className="text-[15px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Compare
            </Link>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={landingNavHref(link.href, pathname)}
                className="text-[15px] text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {user ? (
              <Link
                href="/dashboard"
                className="mt-2 inline-flex items-center justify-center gap-2.5 rounded-lg border border-border bg-background px-4 py-2.5 text-[14px] font-semibold text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt="User profile photo"
                    className="h-7 w-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                    {(user.name || user.email || "U").charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate">
                  {user.name || user.email || "Account"}
                </span>
              </Link>
            ) : (
              <Link
                href="/auth?mode=signin"
                className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-emerald-500 px-5 py-3 text-[14px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
                onClick={() => setMobileMenuOpen(false)}
              >
                Start free
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
