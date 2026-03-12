import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <h1 className="font-serif text-3xl tracking-tight text-[var(--foreground)] sm:text-4xl">
          Social0 Docs
        </h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Documentation for the Social0 dashboard and API.
        </p>
        <Link
          href="/docs"
          className="mt-6 inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-foreground)] transition-colors hover:opacity-90"
        >
          Browse docs
        </Link>
      </div>
    </main>
  );
}
