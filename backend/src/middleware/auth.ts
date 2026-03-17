import { Response, NextFunction } from "express";
import { getAuth } from "firebase-admin/auth";
import { AuthenticatedRequest } from "../request-types";

export async function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed authorization header." });
    return;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    req.log?.warn("Token verification failed.", { error });
    res.status(401).json({ error: "Invalid or expired token." });
  }
}
