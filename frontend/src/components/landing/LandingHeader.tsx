
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { useState, useEffect } from "react";
import { Menu, X, Moon, Sun } from "lucide-react";
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

function navLinksForPath(_pathname: string | null): NavLink[] {
  return landingNavLinks;
}

export function LandingHeader() {
  const pathname = useLocation().pathname;
  const navLinks = navLinksForPath(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;

  useEffect(() => {
    // Check for saved preference or system preference
    const savedTheme = localStorage.getItem("theme");
    const systemDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    if (savedTheme === "dark" || (!savedTheme && systemDark)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (darkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md landing">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex gap-2">
          <span className="relative h-9 w-9 block">
            <Image
              src="/logo-circular.png"
              alt="Social0"
              width={36}
              height={36}
              className="rounded-lg dark:hidden"
            />
            <Image
              src="/logo-dark.png"
              alt="Social0"
              width={36}
              height={36}
              className="rounded-full hidden dark:block absolute inset-0 border border-white"
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

        {/* Desktop Nav */}
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

        {/* Desktop CTA + Theme Toggle */}
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
              className="inline-flex rounded-full items-center gap-2.5 border border-border bg-background px-4 py-2 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted"
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
              <span className="truncate max-w-[140px]">
                {user.name || user.email || "Account"}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-[14px] font-medium text-background transition-all hover:scale-[1.02] hover:bg-neutral-800 dark:hover:bg-neutral-100 dark:hover:text-neutral-900"
            >
              Get started
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        {/* Mobile Menu Button */}
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

      {/* Mobile Menu */}
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
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-[14px] font-medium text-background transition-all hover:scale-[1.02] hover:bg-neutral-800 dark:hover:bg-neutral-100 dark:hover:text-neutral-900"
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
