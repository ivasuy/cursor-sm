import { Router } from "express";

export const configRouter = Router();

const pkg = {
  version: process.env.npm_package_version || "0.1.0",
};

configRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    version: pkg.version,
    features: {
      summarize: true,
      auth: true,
      usage: true,
    },
    firebaseApiKey: process.env.FIREBASE_API_KEY || "",
  });
});
