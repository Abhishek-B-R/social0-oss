import Link from "next/link";
import Image from "next/image";

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <span className="relative h-8 w-8 block">
                <Image
                  src="/logo.png"
                  alt="Social0"
                  width={32}
                  height={32}
                  className="rounded-lg dark:hidden"
                />
                <Image
                  src="/logo-dark.png"
                  alt="Social0"
                  width={32}
                  height={32}
                  className="rounded-lg hidden dark:block absolute inset-0"
                />
              </span>
              <span className="font-semibold text-foreground">Social0</span>
            </Link>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">
              Product
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/#features"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/#pricing"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">
              Legal
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-8 border-t border-border text-center text-muted-foreground text-sm">
          © {currentYear} Social0. All rights reserved. Social0 is operated by B
          R Abhishek.
        </div>
      </div>
    </footer>
  );
}
