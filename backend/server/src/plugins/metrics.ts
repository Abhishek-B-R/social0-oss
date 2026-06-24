import type { FastifyInstance } from "fastify";

type CounterMap = Map<string, number>;

const counters: CounterMap = new Map();

export function incrementMetric(name: string, by = 1) {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function getMetricsSnapshot() {
  const publishSuccess = counters.get("publish.success") ?? 0;
  const publishFailed = counters.get("publish.failed") ?? 0;
  const httpRequests = counters.get("http.requests") ?? 0;
  return {
    publishSuccess,
    publishFailed,
    httpRequests,
    counters: Object.fromEntries(counters.entries()),
    ts: new Date().toISOString(),
  };
}

export async function registerMetricsPlugin(app: FastifyInstance) {
  app.addHook("onResponse", async () => {
    incrementMetric("http.requests");
  });

  app.get("/metrics", async () => getMetricsSnapshot());
}
