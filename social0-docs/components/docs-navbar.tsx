import { IconBrandX, IconExternalLink } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function DocsNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Left: Logo + Docs label */}
        <div className="flex items-center gap-3">
          <a
            href="https://social0.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <span className="font-serif text-[22px] tracking-tight text-[var(--foreground)]">
              Social0
            </span>
          </a>
          <span className="text-[var(--border)]">|</span>
          <span className="text-sm font-medium text-[var(--muted-foreground)]">
            Docs
          </span>
        </div>

        {/* Right: theme toggle + links */}
        <nav className="flex items-center gap-4">
          <ThemeToggle />
          <a
            href="https://social0.app/dashboard/composer"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            Dashboard
            <IconExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
          </a>
          <a
            href="https://x.com/social0_app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            aria-label="X (Twitter)"
          >
            <IconBrandX className="h-4 w-4" strokeWidth={1.5} />
          </a>
        </nav>
      </div>
    </header>
  );
}
