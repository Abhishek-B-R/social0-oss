import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LandingMode = "normal" | "agent";

const STORAGE_KEY = "landing-mode";

type LandingModeContextValue = {
  mode: LandingMode;
  setMode: (mode: LandingMode) => void;
};

const LandingModeContext = createContext<LandingModeContextValue | null>(null);

function readStoredMode(): LandingMode {
  if (typeof window === "undefined") return "normal";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "agent" || stored === "normal") return stored;
  } catch {
    /* ignore */
  }
  return "normal";
}

export function LandingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LandingMode>("normal");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStoredMode());
    setHydrated(true);
  }, []);

  const setMode = useCallback((next: LandingMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ mode: hydrated ? mode : "normal", setMode }),
    [hydrated, mode, setMode],
  );

  return (
    <LandingModeContext.Provider value={value}>
      {children}
    </LandingModeContext.Provider>
  );
}

export function useLandingMode() {
  const ctx = useContext(LandingModeContext);
  if (!ctx) {
    throw new Error("useLandingMode must be used within LandingModeProvider");
  }
  return ctx;
}

export function LandingModeToggle({ className = "" }: { className?: string }) {
  const ctx = useContext(LandingModeContext);
  if (!ctx) return null;

  const { mode, setMode } = ctx;

  return (
    <div
      role="group"
      aria-label="Landing mode"
      className={`inline-flex items-center rounded-lg border border-border bg-background p-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => setMode("normal")}
        aria-pressed={mode === "normal"}
        className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors sm:px-3 ${
          mode === "normal"
            ? "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Normal
      </button>
      <button
        type="button"
        onClick={() => setMode("agent")}
        aria-pressed={mode === "agent"}
        className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors sm:px-3 ${
          mode === "agent"
            ? "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Agent
      </button>
    </div>
  );
}
