import { Router, Response } from "express";
import {
  verifyFirebaseToken,
  AuthenticatedRequest,
} from "../middleware/auth";
import { generateSummary } from "../services/vertex";
import { checkUsageQuota, incrementUsage } from "../services/usage";

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

      res.json({ markdown });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      const status = message.includes("limit reached") ? 429 : 500;
      res.status(status).json({ error: message });
    }
  }
);
