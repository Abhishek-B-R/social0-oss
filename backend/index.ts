import { Hono } from "hono";
import { cors } from "hono/cors";
import { media } from "./routes/media.ts";
import { posts } from "./routes/posts.ts";
import { postResults } from "./routes/post-results.ts";
import { socialAccounts } from "./routes/social-accounts.ts";

const app = new Hono();

// Optional: auth placeholder – validate Bearer token later
app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  // TODO: validate Bearer token / API key; return 401 if invalid
  if (auth && !auth.startsWith("Bearer ")) {
    return c.json({ error: "Invalid Authorization header" }, 401);
  }
  await next();
});

app.use("*", cors());

const v1 = new Hono()
  .route("/media", media)
  .route("/posts", posts)
  .route("/post-results", postResults)
  .route("/social-accounts", socialAccounts);

app.route("/v1", v1);

app.get("/", (c) =>
  c.json({
    name: "Social0",
    description: "Social Media Management Platform",
    version: "0.1.0",
  }),
);

const port = Number(process.env.PORT) || 3001;
console.log(`Server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
