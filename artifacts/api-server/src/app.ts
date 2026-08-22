import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// All /api/* routes are handled first — they must never fall through to the
// static file handler or the SPA fallback below.
app.use("/api", router);

// In production the Vite dev server and its proxy are not running.
// Express itself serves the built frontend so that /api/* and the SPA share
// one origin with zero proxy config needed.
if (process.env["NODE_ENV"] === "production") {
  // The built frontend is at artifacts/al-shaibia-admin/dist/public relative
  // to the workspace root, which is always process.cwd() when started via
  // the run command in .replit.
  const staticDir = path.resolve(process.cwd(), "artifacts/al-shaibia-admin/dist/public");

  if (existsSync(staticDir)) {
    logger.info({ staticDir }, "Serving static frontend");
    app.use(express.static(staticDir));

    // SPA fallback: any non-API path that didn't match a static file gets
    // index.html so React Router can handle client-side navigation.
    // Explicitly guard /api/* so that unmatched API routes return the
    // Express 404 JSON (from the router) rather than silently returning
    // the SPA shell. Express 5 requires a named wildcard — bare "*" is invalid.
    app.get("*splat", (req: Request, res: Response) => {
      if (req.path.startsWith("/api")) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    logger.warn({ staticDir }, "Static dir not found — frontend not served");
  }
}

export default app;
