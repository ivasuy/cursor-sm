import { randomUUID } from "crypto";
import { RequestHandler } from "express";
import { logger } from "../logger";
import { RequestWithContext } from "../request-types";

function getRequestLogLevel(statusCode: number) {
  if (statusCode >= 500) return "error" as const;
  if (statusCode >= 400) return "warn" as const;
  return "info" as const;
}

export const attachRequestContext: RequestHandler = (req, res, next) => {
  const request = req as RequestWithContext;
  const requestIdHeader = req.headers["x-request-id"];
  const requestId =
    typeof requestIdHeader === "string" && requestIdHeader.trim()
      ? requestIdHeader
      : randomUUID();

  request.requestId = requestId;
  request.log = logger.child({
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
  });
  res.setHeader("x-request-id", requestId);

  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const level = getRequestLogLevel(res.statusCode);

    request.log?.[level]("Request completed", {
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
};
