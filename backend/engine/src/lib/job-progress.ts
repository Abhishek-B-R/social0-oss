import {
  createJobProgressStore,
  loadEnv,
  type JobProgressStore,
} from "@social0/shared";

let store: JobProgressStore | null = null;

export function getJobProgress(): JobProgressStore {
  if (!store) {
    store = createJobProgressStore(loadEnv().REDIS_URL);
  }
  return store;
}

export async function closeJobProgress() {
  if (store) {
    await store.close();
    store = null;
  }
}
