import type { FastifyInstance } from "fastify";
import {
  runRouteHandler,
  type RouteHandler,
} from "../../lib/run-route-handler.js";
import { igFbStart } from "../../connect/instagram-facebook-start.js";
import { igFbCallback } from "../../connect/instagram-facebook-callback.js";
import {
  igFbSelectGet,
  igFbSelectPost,
} from "../../connect/instagram-facebook-select.js";
import {
  fbSelectGet,
  fbSelectPost,
} from "../../connect/facebook-select.js";
import {
  liSelectGet,
  liSelectPost,
} from "../../connect/linkedin-select.js";
import { blueskyByok } from "../../connect/bluesky-byok.js";
import { refreshTokens } from "../../connect/refresh-tokens.js";
import { refreshTwitterPremium } from "../../connect/refresh-twitter-premium.js";
import { platformStart } from "../../connect/platform-start.js";
import { platformCallback } from "../../connect/platform-callback.js";
import { platformReauth } from "../../connect/platform-reauth.js";

export async function registerConnectRoutes(app: FastifyInstance) {
  app.get("/connect/instagram-facebook", async (req, reply) => {
    await runRouteHandler(req, reply, igFbStart);
  });

  app.get("/connect/instagram-facebook/callback", async (req, reply) => {
    await runRouteHandler(req, reply, igFbCallback);
  });

  app.get("/connect/instagram-facebook/select", async (req, reply) => {
    await runRouteHandler(req, reply, igFbSelectGet);
  });

  app.post("/connect/instagram-facebook/select", async (req, reply) => {
    await runRouteHandler(req, reply, igFbSelectPost);
  });

  app.get("/connect/facebook/select", async (req, reply) => {
    await runRouteHandler(req, reply, fbSelectGet);
  });

  app.post("/connect/facebook/select", async (req, reply) => {
    await runRouteHandler(req, reply, fbSelectPost);
  });

  app.get("/connect/linkedin/select", async (req, reply) => {
    await runRouteHandler(req, reply, liSelectGet);
  });

  app.post("/connect/linkedin/select", async (req, reply) => {
    await runRouteHandler(req, reply, liSelectPost);
  });

  app.post("/connect/bluesky/byok", async (req, reply) => {
    await runRouteHandler(req, reply, blueskyByok);
  });

  app.post("/connect/refresh-tokens", async (req, reply) => {
    await runRouteHandler(req, reply, refreshTokens);
  });

  app.post("/connect/refresh-twitter-premium", async (req, reply) => {
    await runRouteHandler(req, reply, refreshTwitterPremium);
  });

  app.get("/connect/:platform/callback", async (req, reply) => {
    const { platform } = req.params as { platform: string };
    await runRouteHandler(
      req,
      reply,
      platformCallback as unknown as RouteHandler,
      { platform },
    );
  });

  app.get("/connect/:platform/reauth", async (req, reply) => {
    const { platform } = req.params as { platform: string };
    await runRouteHandler(req, reply, platformReauth as RouteHandler, {
      platform,
    });
  });

  app.get("/connect/:platform", async (req, reply) => {
    const { platform } = req.params as { platform: string };
    await runRouteHandler(req, reply, platformStart as RouteHandler, {
      platform,
    });
  });
}
