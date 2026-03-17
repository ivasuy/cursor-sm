import { NextFunction, Response } from "express";
import { logger } from "../logger";
import { RequestWithContext } from "../request-types";

export function errorHandler(
  error: unknown,
  req: RequestWithContext,
  res: Response,
  _next: NextFunction
): void {
  const requestLogger = req.log || logger;
  requestLogger.error("Unhandled request error", {
    error,
    statusCode: res.statusCode >= 400 ? res.statusCode : 500,
  });

  if (res.headersSent) {
    return;
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";
  res.status(500).json({ error: message });
}
