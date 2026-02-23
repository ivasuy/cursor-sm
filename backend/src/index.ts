import "dotenv/config";
import express from "express";
import cors from "cors";
import { initializeApp, cert } from "firebase-admin/app";
import { sessionRouter } from "./routes/session";
import { authRouter } from "./routes/auth";
import { configRouter } from "./routes/config";
import * as path from "path";
import * as fs from "fs";

let firebaseReady = false;

const firebaseServiceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./secrets/cursor.json";

try {
  const resolved = path.resolve(firebaseServiceAccountPath);
  if (!fs.existsSync(resolved)) {
    console.warn(
      `[WARN] Firebase service account not found at ${resolved}. Running in degraded mode — auth and session routes will return 503.`
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    initializeApp({ credential: cert(require(resolved)) });
    firebaseReady = true;
    console.log("[INFO] Firebase initialized successfully.");
  }
} catch (err) {
  console.error(
    "[ERROR] Firebase initialization failed:",
    err instanceof Error ? err.message : err
  );
  console.warn("[WARN] Running in degraded mode.");
}

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", firebase: firebaseReady });
});

app.use("/api/config", configRouter);

const firebaseGuard: express.RequestHandler = (_req, res, next) => {
  if (!firebaseReady) {
    res.status(503).json({
      error:
        "Service unavailable — Firebase not configured. Check server logs.",
    });
    return;
  }
  next();
};

app.use("/api/auth", firebaseGuard, authRouter);
app.use("/api/session", firebaseGuard, sessionRouter);

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
  if (!firebaseReady) {
    console.log(
      "  ⚠  Degraded mode: /api/auth and /api/session return 503"
    );
  }
});
