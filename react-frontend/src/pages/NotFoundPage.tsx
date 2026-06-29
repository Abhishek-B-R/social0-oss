import Link from "@/components/AppLink";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="text-4xl font-bold font-serif text-foreground">404</h1>
      <p className="mt-2 text-text-muted">This page could not be found.</p>
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
      >
        Back to home
      </Link>
    </div>
  );
}
