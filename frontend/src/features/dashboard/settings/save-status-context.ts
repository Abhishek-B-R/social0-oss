import { createContext, useContext } from "react";

/**
 * Section-wide autosave status. Every autosaving field reports its saves
 * through `track`, and one indicator in the section header shows
 * "Saving…" / "Saved" / "Not saved" for all of them.
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type SaveStatusApi = {
  status: SaveStatus;
  /** Wraps a save so the indicator reflects it. Rethrows on failure. */
  track: <T>(work: Promise<T>) => Promise<T>;
};

const noopApi: SaveStatusApi = {
  status: "idle",
  track: (work) => work,
};

export const SaveStatusContext = createContext<SaveStatusApi>(noopApi);

export function useSaveStatus(): SaveStatusApi {
  return useContext(SaveStatusContext);
}
