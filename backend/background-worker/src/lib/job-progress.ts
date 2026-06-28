import {
  createJobProgressStore,
  getRedisUrl,
  type JobProgressStore,
} from "@social0/shared";
import { createJobProgressPersistHooks } from "./job-progress-persist.js";

let store: JobProgressStore | null = null;

export function getJobProgress(): JobProgressStore {
  if (!store) {
    store = createJobProgressStore(
      getRedisUrl(),
      createJobProgressPersistHooks(),
    );
  }
  return store;
}

export async function closeJobProgress() {
  if (store) {
    await store.close();
    store = null;
  }
}
