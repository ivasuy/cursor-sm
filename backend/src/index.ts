import "dotenv/config";
import express from "express";
import cors from "cors";
import { initializeApp, cert } from "firebase-admin/app";
import { sessionRouter } from "./routes/session";
import { authRouter } from "./routes/auth";
import { configRouter } from "./routes/config";
import { userRouter } from "./routes/user";
import { cardRouter } from "./routes/card";
import { logger } from "./logger";
import { attachRequestContext } from "./middleware/request-context";
import { errorHandler } from "./middleware/error-handler";
import * as path from "path";
import * as fs from "fs";

let firebaseReady = false;

const firebaseServiceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./secrets/cursor.json";

try {
  const resolved = path.resolve(firebaseServiceAccountPath);
  if (!fs.existsSync(resolved)) {
    logger.warn("Firebase service account not found. Running in degraded mode.", {
      firebaseServiceAccountPath: resolved,
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    initializeApp({ credential: cert(require(resolved)) });
    firebaseReady = true;
    logger.info("Firebase initialized successfully.");
  }
} catch (err) {
  logger.error("Firebase initialization failed.", { error: err });
  logger.warn("Running in degraded mode.");
}

const app = express();

app.use(attachRequestContext);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);
app.use(express.json({ limit: "10mb" }));
app.use("/static", express.static(path.join(__dirname, "../public")));

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
app.use("/api/user", firebaseGuard, userRouter);
app.use("/api/card", firebaseGuard, cardRouter);
app.use(errorHandler);

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  logger.info("Backend server started.", { port });
  if (!firebaseReady) {
    logger.warn("Degraded mode enabled for Firebase-backed routes.");
  }
});
