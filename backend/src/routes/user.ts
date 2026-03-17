import { Router, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import {
  verifyFirebaseToken,
} from "../middleware/auth";
import { AuthenticatedRequest } from "../request-types";

export const userRouter = Router();

userRouter.post(
  "/register",
  verifyFirebaseToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || req.body.email;

      if (!uid) {
        res.status(401).json({ error: "User not authenticated." });
        return;
      }

      const db = getFirestore();
      const userRef = db.doc(`users/${uid}`);
      const doc = await userRef.get();

      if (!doc.exists) {
        // Create new user profile
        await userRef.set({
          email: email || null,
          displayName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        res.status(201).json({ created: true, uid });
      } else {
        // Update last login
        await userRef.update({
          lastLoginAt: new Date().toISOString(),
        });
        res.json({ created: false, uid });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      req.log?.error("User registration failed.", {
        error,
        uid: req.user?.uid,
      });
      res.status(500).json({ error: message });
    }
  }
);

userRouter.get(
  "/profile",
  verifyFirebaseToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: "User not authenticated." });
        return;
      }

      const db = getFirestore();
      const doc = await db.doc(`users/${uid}`).get();

      if (!doc.exists) {
        res.json({ displayName: null });
        return;
      }

      const data = doc.data()!;
      res.json({
        displayName: data.displayName || null,
        email: req.user?.email || null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      req.log?.error("Fetching user profile failed.", {
        error,
        uid: req.user?.uid,
      });
      res.status(500).json({ error: message });
    }
  }
);

userRouter.patch(
  "/profile",
  verifyFirebaseToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: "User not authenticated." });
        return;
      }

      const { displayName } = req.body;
      if (typeof displayName !== "string" || displayName.length > 50) {
        res
          .status(400)
          .json({ error: "displayName must be a string (max 50 chars)." });
        return;
      }

      const db = getFirestore();
      await db.doc(`users/${uid}`).set(
        {
          displayName: displayName.trim(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      res.json({ displayName: displayName.trim() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      req.log?.error("Updating user profile failed.", {
        error,
        uid: req.user?.uid,
      });
      res.status(500).json({ error: message });
    }
  }
);
