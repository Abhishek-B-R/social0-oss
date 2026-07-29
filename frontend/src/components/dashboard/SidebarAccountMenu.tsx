import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import Link from "@/components/AppLink";
import { signOut } from "@/lib/auth-client";
import { DOCS_DASHBOARD_URL } from "@/lib/docs-url";
import { cn } from "@/lib/utils";
import {
  IconBook2,
  IconBrandX,
  IconChevronDown,
  IconExternalLink,
  IconHome,
  IconKey,
  IconLink,
  IconLogout,
  IconMessageCircle,
  IconMoon,
  IconSettings,
  IconSun,
  IconDeviceDesktop,
  IconWallet,
} from "@tabler/icons-react";

/** Strong ease-out — matches improve-animations / Emil UI budget. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

type AccountMenuVariant = "sidebar" | "page";

type SidebarAccountMenuProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  planLabel: string;
  /** sidebar: opens upward in the nav. page: opens downward on More. */
  variant?: AccountMenuVariant;
  className?: string;
};

function planBadgeLabel(planLabel: string): string | null {
  if (!planLabel || planLabel === "…" || planLabel === "Guest") return null;
  if (planLabel.startsWith("Pro")) return "PRO";
  if (planLabel.startsWith("Growth")) return "GRO";
  if (planLabel.startsWith("Starter")) return "LITE";
  return "FREE";
}

function MenuRow({
  icon: Icon,
  label,
  external,
  onClick,
  href,
  danger,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  external?: boolean;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const className = cn(
    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-[background-color,transform,color] duration-150",
    "hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-[0.98]",
    danger
      ? "text-red-600 dark:text-red-400"
      : "text-sidebar-text",
  );

  const inner = (
    <>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          danger ? "text-red-600 dark:text-red-400" : "text-sidebar-muted",
        )}
        size={16}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {external ? (
        <IconExternalLink
          className="h-3.5 w-3.5 shrink-0 text-sidebar-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          size={14}
        />
      ) : null}
    </>
  );

  if (href) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          onClick={onClick}
        >
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} prefetch className={className} onClick={onClick}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  );
}

function ThemeSegment() {
  const { theme, setTheme } = useTheme();
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const options = [
    { value: "light" as const, label: "Light", Icon: IconSun },
    { value: "dark" as const, label: "Dark", Icon: IconMoon },
    { value: "system" as const, label: "System", Icon: IconDeviceDesktop },
  ];

  if (!ready) {
    return (
      <div className="h-9 w-full animate-pulse rounded-lg bg-black/[0.04] dark:bg-white/[0.06]" />
    );
  }

  return (
    <div
      className="grid grid-cols-3 gap-0.5 rounded-lg bg-black/[0.04] p-0.5 dark:bg-white/[0.06]"
      role="group"
      aria-label="Theme"
    >
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-[background-color,color,transform] duration-150",
              "active:scale-[0.97]",
              active
                ? "bg-sidebar-menu-bg text-sidebar-text shadow-sm"
                : "text-sidebar-muted hover:text-sidebar-text",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" size={14} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AccountMenuPanel({
  displayName,
  email,
  image,
  badge,
  planLabel,
  onClose,
  onSignOut,
}: {
  displayName: string;
  email?: string | null;
  image?: string | null;
  badge: string | null;
  planLabel: string;
  onClose: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="border-b border-sidebar-menu-border bg-gradient-to-b from-accent/[0.08] to-transparent px-3 pb-4 pt-3.5">
        <div className="flex items-center gap-2.5">
          <div className="relative shrink-0">
            {image ? (
              <img
                src={image}
                alt=""
                className="h-10 w-10 rounded-full object-cover ring-1 ring-sidebar-menu-border"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent ring-1 ring-sidebar-menu-border">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {badge ? (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-accent px-1 py-[1px] text-[8px] font-bold leading-none tracking-wide text-accent-foreground shadow-sm">
                {badge}
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-text">
              {displayName}
            </p>
            <p className="truncate text-xs text-sidebar-muted">
              {email || planLabel}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/connections"
          prefetch
          onClick={onClose}
          className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent transition-opacity hover:opacity-80 active:scale-[0.98]"
        >
          <IconLink className="h-4 w-4" size={16} />
          Connect accounts
        </Link>
      </div>

      <div className="px-1.5 pb-1.5 pt-2.5">
        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
          Resources
        </p>
        <MenuRow
          icon={IconBook2}
          label="Docs"
          href={DOCS_DASHBOARD_URL}
          external
          onClick={onClose}
        />
        <MenuRow
          icon={IconMessageCircle}
          label="Get support"
          href="/dashboard/feedback"
          onClick={onClose}
        />
        <MenuRow
          icon={IconBrandX}
          label="Follow us"
          href="https://x.com/social0_app"
          external
          onClick={onClose}
        />
        <MenuRow
          icon={IconHome}
          label="View landing page"
          href="/home"
          onClick={onClose}
        />
      </div>

      <div className="mx-3 border-t border-sidebar-menu-border" />

      <div className="px-1.5 py-1.5">
        <MenuRow
          icon={IconSettings}
          label="Account settings"
          href="/dashboard/settings"
          onClick={onClose}
        />
        <MenuRow
          icon={IconWallet}
          label="Billing"
          href="/dashboard/billing"
          onClick={onClose}
        />
        <MenuRow
          icon={IconKey}
          label="Developer"
          href="/dashboard/api-keys"
          onClick={onClose}
        />
      </div>

      <div className="mx-3 border-t border-sidebar-menu-border" />

      <div className="px-3 py-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
          Theme
        </p>
        <ThemeSegment />
      </div>

      <div className="mx-3 border-t border-sidebar-menu-border" />

      <div className="px-1.5 py-1.5 pb-2">
        <MenuRow icon={IconLogout} label="Log out" danger onClick={onSignOut} />
      </div>
    </>
  );
}

export function SidebarAccountMenu({
  user,
  planLabel,
  variant = "sidebar",
  className,
}: SidebarAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const menuId = useId();
  const displayName = user.name || user.email || "User";
  const badge = planBadgeLabel(planLabel);
  const close = () => setOpen(false);
  const opensUp = variant === "sidebar";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    close();
    await signOut();
    window.location.href = "/";
  };

  const duration = reduceMotion ? 0.12 : 0.2;
  const enterY = opensUp ? 8 : -8;
  const exitY = opensUp ? 6 : -6;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Account menu"
            initial={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    transform: `translateY(${enterY}px) scale(0.96)`,
                  }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : {
                    opacity: 1,
                    transform: "translateY(0px) scale(1)",
                  }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    transform: `translateY(${exitY}px) scale(0.97)`,
                  }
            }
            transition={{ duration, ease: EASE_OUT }}
            style={{
              transformOrigin: opensUp ? "bottom center" : "top center",
            }}
            className={cn(
              "z-50 overflow-hidden rounded-2xl border border-sidebar-menu-border bg-sidebar-menu-bg shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)]",
              opensUp
                ? "absolute bottom-[calc(100%+0.5rem)] left-0 w-64"
                : "absolute top-[calc(100%+0.5rem)] left-0 right-0 w-full min-w-64",
            )}
          >
            <AccountMenuPanel
              displayName={displayName}
              email={user.email}
              image={user.image}
              badge={badge}
              planLabel={planLabel}
              onClose={close}
              onSignOut={() => void handleSignOut()}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl text-left",
          "transition-[background-color,transform] duration-150",
          "active:scale-[0.98]",
          variant === "sidebar"
            ? cn(
                "sidebar-user-block px-3 py-2",
                "hover:bg-sidebar-active",
                open && "bg-sidebar-active",
              )
            : cn(
                "px-1 py-1.5 -mx-1 touch-manipulation",
                "hover:bg-bg-subtle",
                open && "bg-bg-subtle",
              ),
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={open ? "Close account menu" : "Open account menu"}
      >
        <div className="relative shrink-0">
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className={cn(
                "rounded-full object-cover",
                variant === "sidebar" ? "h-9 w-9" : "h-10 w-10",
              )}
            />
          ) : (
            <div
              className={cn(
                "flex items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent",
                variant === "sidebar" ? "h-9 w-9" : "h-10 w-10",
              )}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {badge ? (
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded bg-accent px-1 py-[1px] text-[7px] font-bold leading-none tracking-wide text-accent-foreground">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-medium",
              variant === "sidebar" ? "text-sidebar-text" : "text-foreground",
            )}
          >
            {displayName}
          </p>
          <p
            className={cn(
              "truncate text-xs",
              variant === "sidebar" ? "text-sidebar-text" : "text-text-muted",
            )}
          >
            {planLabel}
          </p>
        </div>
        <IconChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            variant === "sidebar" ? "text-sidebar-text" : "text-foreground",
            open && "rotate-180",
          )}
          size={16}
        />
      </button>
    </div>
  );
}
