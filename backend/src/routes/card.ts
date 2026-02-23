import { Router, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import {
  verifyFirebaseToken,
  AuthenticatedRequest,
} from "../middleware/auth";
import { getSessionsForDate, getUserStreak } from "../services/sessions";
import { generateCardImage } from "../services/card";

export const cardRouter = Router();

cardRouter.get(
  "/",
  verifyFirebaseToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: "User not authenticated." });
        return;
      }

      const date =
        (req.query.date as string) ||
        new Date().toISOString().split("T")[0];

      const db = getFirestore();
      const userDoc = await db.doc(`users/${uid}`).get();
      const userData = userDoc.exists ? userDoc.data()! : {};
      const displayName = (userData.displayName as string) || req.user?.email || "developer";

      const sessions = await getSessionsForDate(uid, date);
      if (sessions.length === 0) {
        res.status(404).json({ error: "No sessions found for this date." });
        return;
      }

      const totalAdded = sessions.reduce((s, r) => s + r.linesAdded, 0);
      const totalRemoved = sessions.reduce((s, r) => s + r.linesRemoved, 0);
      const totalFiles = sessions.reduce((s, r) => s + r.filesTouched, 0);
      const branch = sessions[0].branch;

      const streak = await getUserStreak(uid);

      const png = await generateCardImage({
        displayName,
        linesAdded: totalAdded,
        linesRemoved: totalRemoved,
        filesChanged: totalFiles,
        streak,
        date,
        branch,
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="worktrace-${date}.png"`
      );
      res.send(png);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }
);
