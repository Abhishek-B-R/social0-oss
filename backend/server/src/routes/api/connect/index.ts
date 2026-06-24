import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { runNextRouteHandler, type NextRouteHandler } from "../../../lib/run-next-handler.js";
import { GET as igFbStart } from "../../../connect/instagram-facebook-start.js";
import { GET as igFbCallback } from "../../../connect/instagram-facebook-callback.js";
import {
  GET as igFbSelectGet,
  POST as igFbSelectPost,
} from "../../../connect/instagram-facebook-select.js";
import {
  GET as fbSelectGet,
  POST as fbSelectPost,
} from "../../../connect/facebook-select.js";
import {
  GET as liSelectGet,
  POST as liSelectPost,
} from "../../../connect/linkedin-select.js";
import { POST as blueskyByok } from "../../../connect/bluesky-byok.js";
import { POST as refreshTokens } from "../../../connect/refresh-tokens.js";
import { POST as refreshTwitterPremium } from "../../../connect/refresh-twitter-premium.js";
import { GET as platformStart } from "../../../connect/platform-start.js";
import { GET as platformCallback } from "../../../connect/platform-callback.js";
import { GET as platformReauth } from "../../../connect/platform-reauth.js";

export async function registerConnectRoutes(app: FastifyInstance) {
  app.get("/connect/instagram-facebook", async (req, reply) => {
    await runNextRouteHandler(req, reply, igFbStart);
  });

  app.get("/connect/instagram-facebook/callback", async (req, reply) => {
    await runNextRouteHandler(req, reply, igFbCallback);
  });

  app.get("/connect/instagram-facebook/select", async (req, reply) => {
    await runNextRouteHandler(req, reply, igFbSelectGet);
  });

  app.post("/connect/instagram-facebook/select", async (req, reply) => {
    await runNextRouteHandler(req, reply, igFbSelectPost);
  });

  app.get("/connect/facebook/select", async (req, reply) => {
    await runNextRouteHandler(req, reply, fbSelectGet);
  });

  app.post("/connect/facebook/select", async (req, reply) => {
    await runNextRouteHandler(req, reply, fbSelectPost);
  });

  app.get("/connect/linkedin/select", async (req, reply) => {
    await runNextRouteHandler(req, reply, liSelectGet);
  });

  app.post("/connect/linkedin/select", async (req, reply) => {
    await runNextRouteHandler(req, reply, liSelectPost);
  });

  app.post("/connect/bluesky/byok", async (req, reply) => {
    await runNextRouteHandler(req, reply, blueskyByok);
  });

  app.post("/connect/refresh-tokens", async (req, reply) => {
    await runNextRouteHandler(req, reply, refreshTokens);
  });

  app.post("/connect/refresh-twitter-premium", async (req, reply) => {
    await runNextRouteHandler(req, reply, refreshTwitterPremium);
  });

  app.get("/connect/:platform/callback", async (req, reply) => {
    const { platform } = req.params as { platform: string };
    await runNextRouteHandler(
      req,
      reply,
      platformCallback as unknown as NextRouteHandler,
      { platform },
    );
  });

  app.get("/connect/:platform/reauth", async (req, reply) => {
    const { platform } = req.params as { platform: string };
    await runNextRouteHandler(req, reply, platformReauth as NextRouteHandler, {
      platform,
    });
  });

  app.get("/connect/:platform", async (req, reply) => {
    const { platform } = req.params as { platform: string };
    await runNextRouteHandler(req, reply, platformStart as NextRouteHandler, {
      platform,
    });
  });
}

export { getSessionFromRequest } from "../../../lib/session.js";
