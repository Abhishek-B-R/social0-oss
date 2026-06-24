import {
  createJobProgressStore,
  loadEnv,
  type JobProgressStore,
} from "@social0/shared";
import { createJobProgressPersistHooks } from "./job-progress-persist.js";

let store: JobProgressStore | null = null;

export function getJobProgress(): JobProgressStore {
  if (!store) {
    store = createJobProgressStore(
      loadEnv().REDIS_URL,
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
