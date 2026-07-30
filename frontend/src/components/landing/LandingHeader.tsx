
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { useState, useEffect } from "react";
import { Menu, X, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSession } from "@/lib/auth-client";
import Image from "@/components/AppImage";

type NavLink = { href: string; label: string };

const landingNavLinks: NavLink[] = [
  { href: "/#features", label: "Product" },
  { href: "/#platforms", label: "Platforms" },
  { href: "/#developers", label: "Developers" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
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
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = useSession();
  const user = session?.user;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const darkMode = mounted && resolvedTheme === "dark";

  const toggleDarkMode = () => {
    setTheme(darkMode ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <div className="flex gap-2">
          <span className="relative block h-9 w-9">
            <Image
              src="/logo-circular.webp"
              alt="Social0"
              width={36}
              height={36}
              priority
              className="rounded-lg dark:hidden"
            />
            <Image
              src="/logo-dark.webp"
              alt="Social0"
              width={36}
              height={36}
              priority
              className="absolute inset-0 hidden rounded-full border border-white/20 dark:block"
            />
          </span>
          <Link
            href={pathname === "/home" ? "/home" : "/"}
            className="flex items-center gap-2"
          >
            <span className="font-serif text-[22px] tracking-tight text-foreground">
              Social0
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-8 md:flex">
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

        <div className="hidden items-center gap-3 md:flex">
          <button
            type="button"
            onClick={toggleDarkMode}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {darkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
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
              href="/auth"
              className="inline-flex items-center gap-2 rounded-[10px] bg-emerald-500 px-5 py-2.5 text-[14px] font-semibold text-[#04140c] transition-all hover:scale-[1.02] hover:bg-emerald-400"
            >
              Get started
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={toggleDarkMode}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {darkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground"
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
        <div className="border-t border-border bg-background px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
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
                href="/auth"
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-[10px] bg-emerald-500 px-5 py-2.5 text-[14px] font-semibold text-[#04140c] transition-all hover:scale-[1.02] hover:bg-emerald-400"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get started
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
