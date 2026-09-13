import { createDb } from "@social0/shared/db/client";
import { loadServerEnv } from "../lib/env.js";

export const { db, closeDb } = createDb(loadServerEnv().DATABASE_URL);
