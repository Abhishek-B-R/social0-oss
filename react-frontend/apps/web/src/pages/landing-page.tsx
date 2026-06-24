import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <span className="text-xl font-bold text-accent">Social0</span>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Schedule and publish to every platform
        </h1>
        <p className="mt-4 text-lg text-text-muted">
          React + Vite rebuild — connected to your Fastify backend.
        </p>
        <Button className="mt-8" size="lg" asChild>
          <Link to="/dashboard">Open dashboard</Link>
        </Button>
      </main>
    </div>
  );
}
