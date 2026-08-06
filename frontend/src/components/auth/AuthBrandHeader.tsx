import Link from "@/components/AppLink";
import Image from "@/components/AppImage";

type AuthBrandHeaderProps = {
  showNav?: boolean;
};

export function AuthBrandHeader({ showNav = false }: AuthBrandHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="relative block h-9 w-9 shrink-0">
            <Image
              src="/logo-circular.webp"
              alt=""
              width={36}
              height={36}
              className="rounded-lg dark:hidden"
            />
            <Image
              src="/logo-dark.webp"
              alt=""
              width={36}
              height={36}
              className="absolute inset-0 hidden rounded-full border border-white dark:block"
            />
          </span>
          <span className="font-logo text-[22px] font-normal tracking-tight text-foreground">
            Social0
          </span>
        </Link>
        {showNav ? (
          <nav className="hidden items-center gap-6 sm:flex">
            <Link
              href="/#features"
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Product
            </Link>
            <Link
              href="/pricing"
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/mcp"
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              MCP
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
