import Link from "@/components/AppLink";
import Image from "@/components/AppImage";

type AuthBrandHeaderProps = {
  showNav?: boolean;
};

export function AuthBrandHeader({ showNav = false }: AuthBrandHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="relative block h-9 w-9">
            <Image
              src="/logo-circular.webp"
              alt="Social0"
              width={36}
              height={36}
              className="rounded-lg dark:hidden"
            />
            <Image
              src="/logo-dark.webp"
              alt="Social0"
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
          <nav className="hidden items-center gap-8 sm:flex">
            <Link
              href="/#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/terms"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
