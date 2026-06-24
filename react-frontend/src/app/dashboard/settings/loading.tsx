export default function SettingsLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="text-sm font-medium text-text-muted">Loading settings…</p>
    </div>
  );
}
