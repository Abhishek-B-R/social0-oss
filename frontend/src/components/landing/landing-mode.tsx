import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";

export type LandingMode = "normal" | "agent";

type LandingModeContextValue = {
  mode: LandingMode;
  setMode: (mode: LandingMode) => void;
};

const LandingModeContext = createContext<LandingModeContextValue | null>(null);

/** URL: `normal` | `agentic` (also accepts `agent`). Missing/invalid → agent. */
function parseModeParam(raw: string | null): LandingMode | null {
  if (raw === "normal") return "normal";
  if (raw === "agentic" || raw === "agent") return "agent";
  return null;
}

function modeToParam(mode: LandingMode): "normal" | "agentic" {
  return mode === "agent" ? "agentic" : "normal";
}

function readModeFromLocation(): LandingMode {
  if (typeof window === "undefined") return "agent";
  return (
    parseModeParam(new URLSearchParams(window.location.search).get("mode")) ??
    "agent"
  );
}

export function LandingModeProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setModeState] = useState<LandingMode>(() =>
    readModeFromLocation(),
  );

  const modeFromUrl =
    parseModeParam(searchParams.get("mode")) ?? ("agent" as const);

  // Back/forward + external ?mode= changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(modeFromUrl);
  }, [modeFromUrl]);

  const setMode = useCallback(
    (next: LandingMode) => {
      setModeState(next);
      setSearchParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev);
          nextParams.set("mode", modeToParam(next));
          return nextParams;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

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

/** Defaults to Agents mode when rendered outside the provider (e.g. stray mounts). */
export function useLandingModeOrDefault(): LandingModeContextValue {
  const ctx = useContext(LandingModeContext);
  return ctx ?? { mode: "agent", setMode: () => {} };
}

export function LandingModeToggle({ className = "" }: { className?: string }) {
  const ctx = useContext(LandingModeContext);
  if (!ctx) return null;

  const { mode, setMode } = ctx;
  const isAgent = mode === "agent";

  return (
    <div
      role="group"
      aria-label="Scheduling mode"
      className={`flex w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 sm:gap-x-3 ${className}`}
    >
      <button
        type="button"
        onClick={() => setMode("normal")}
        className={`text-[12px] transition-colors sm:text-[13px] ${
          !isAgent
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        I need normal scheduling
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={isAgent}
        aria-label={
          isAgent
            ? "Agentic scheduling on. Switch to normal scheduling."
            : "Normal scheduling on. Switch to agentic scheduling."
        }
        onClick={() => setMode(isAgent ? "normal" : "agent")}
        className="relative h-5 w-9 shrink-0 rounded-full bg-emerald-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          aria-hidden
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            isAgent ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>

      <button
        type="button"
        onClick={() => setMode("agent")}
        className={`text-[12px] transition-colors sm:text-[13px] ${
          isAgent
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        I need agentic scheduling
      </button>
    </div>
  );
}
