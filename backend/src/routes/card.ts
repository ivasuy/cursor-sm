import { Router, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import {
  verifyFirebaseToken,
} from "../middleware/auth";
import { AuthenticatedRequest } from "../request-types";
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

      const givenName = req.user?.given_name as string | undefined;
      const fullName = req.user?.name as string | undefined;
      const displayName =
        (userData.displayName as string) ||
        givenName ||
        fullName?.split(" ")[0] ||
        "developer";

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

      const readinessScore =
        sessions.find((s) => s.readinessScore != null)?.readinessScore ?? null;
      const shareableUpdate =
        sessions.find((s) => s.personalInsights.length > 1)
          ?.personalInsights[1] ?? null;

      const png = await generateCardImage({
        displayName,
        linesAdded: totalAdded,
        linesRemoved: totalRemoved,
        filesChanged: totalFiles,
        streak,
        date,
        branch,
        readinessScore,
        shareableUpdate,
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
      req.log?.error("Generating daily card failed.", {
        error,
        uid: req.user?.uid,
      });
      res.status(500).json({ error: message });
    }
  }
);

cardRouter.post(
  "/generate",
  verifyFirebaseToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: "User not authenticated." });
        return;
      }

      const {
        date,
        branch,
        linesAdded,
        linesRemoved,
        filesChanged,
      } = req.body as {
        date?: string;
        branch?: string | null;
        linesAdded?: number;
        linesRemoved?: number;
        filesChanged?: number;
      };

      const dateStr =
        date || new Date().toISOString().split("T")[0];
      const linesAdd = typeof linesAdded === "number" ? linesAdded : 0;
      const linesRem = typeof linesRemoved === "number" ? linesRemoved : 0;
      const files = typeof filesChanged === "number" ? filesChanged : 0;

      const db = getFirestore();
      const userDoc = await db.doc(`users/${uid}`).get();
      const userData = userDoc.exists ? userDoc.data()! : {};

      const givenName = req.user?.given_name as string | undefined;
      const fullName = req.user?.name as string | undefined;
      const displayName =
        (userData.displayName as string) ||
        givenName ||
        fullName?.split(" ")[0] ||
        "developer";

      const streak = await getUserStreak(uid);

      const png = await generateCardImage({
        displayName,
        linesAdded: linesAdd,
        linesRemoved: linesRem,
        filesChanged: files,
        streak,
        date: dateStr,
        branch: branch ?? null,
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="worktrace-${dateStr}.png"`
      );
      res.send(png);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      req.log?.error("Generating custom card failed.", {
        error,
        uid: req.user?.uid,
      });
      res.status(500).json({ error: message });
    }
  }
);
