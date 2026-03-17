import { Router, Response } from "express";
import {
  verifyFirebaseToken,
} from "../middleware/auth";
import { AuthenticatedRequest } from "../request-types";
import { generateSummary } from "../services/vertex";
import { generateContext } from "../services/context";
import { checkUsageQuota, incrementUsage } from "../services/usage";
import { saveSessionSummary } from "../services/sessions";

export const sessionRouter = Router();

sessionRouter.post(
  "/summarize",
  verifyFirebaseToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: "User not authenticated." });
        return;
      }

      await checkUsageQuota(uid);

      const { session, analysis } = req.body;
      if (!session || !analysis) {
        res
          .status(400)
          .json({ error: "Missing session or analysis in request body." });
        return;
      }

      const markdown = await generateSummary({ session, analysis });
      await incrementUsage(uid);

      try {
        await saveSessionSummary(uid, { session, analysis }, markdown);
      } catch (error) {
        // Non-critical: session summary save failure shouldn't block response
        req.log?.warn("Failed to persist session summary.", { error, uid });
      }

      res.json({ markdown });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      const status = message.includes("limit reached") ? 429 : 500;
      req.log?.error("Session summarization failed.", {
        error,
        uid: req.user?.uid,
        status,
      });
      res.status(status).json({ error: message });
    }
  }
);

sessionRouter.post(
  "/context",
  verifyFirebaseToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: "User not authenticated." });
        return;
      }

      await checkUsageQuota(uid);

      const { session, analysis, previousContext } = req.body;
      if (!session || !analysis) {
        res
          .status(400)
          .json({ error: "Missing session or analysis in request body." });
        return;
      }

      const context = await generateContext({
        session,
        analysis,
        previousContext: previousContext || null,
      });
      await incrementUsage(uid);

      res.json({ context });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      const status = message.includes("limit reached") ? 429 : 500;
      req.log?.error("Context generation failed.", {
        error,
        uid: req.user?.uid,
        status,
      });
      res.status(status).json({ error: message });
    }
  }
);
