import { Request } from "express";
import { DecodedIdToken } from "firebase-admin/auth";
import { Logger } from "./logger";

export interface RequestWithContext extends Request {
  requestId?: string;
  log?: Logger;
}

export interface AuthenticatedRequest extends RequestWithContext {
  user?: DecodedIdToken;
}
