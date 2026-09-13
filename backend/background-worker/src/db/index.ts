import { createDb } from "@social0/shared/db/client";
import { loadWorkerEnv } from "../lib/env.js";

export const { db, closeDb } = createDb(loadWorkerEnv().DATABASE_URL);
