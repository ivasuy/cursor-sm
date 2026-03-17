import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";
import { SessionData, SessionAnalysis } from "./types";

const CONFIG_NAMESPACE = "worktrace";

export async function validateBackendConnection(
  extensionContext: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const backendUrl =
    config.get<string>("backendUrl") || "http://localhost:3000";

  try {
    const parsed = new URL(`${backendUrl}/api/config`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    await new Promise<void>((resolve) => {
      const req = lib.get(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? "443" : "80"),
          path: parsed.pathname,
          timeout: 5000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", async () => {
            try {
              const json = JSON.parse(data);
              if (json.status === "ok") {
                statusBarItem.tooltip += ` | Backend v${json.version || "?"}`;

                if (json.firebaseApiKey) {
                  const currentKey = config.get<string>("firebaseApiKey");
                  if (!currentKey) {
                    await config.update(
                      "firebaseApiKey",
                      json.firebaseApiKey,
                      vscode.ConfigurationTarget.Global
                    );
                  }
                }

                const email =
                  extensionContext.globalState.get<string>("userEmail");
                const hasSeenPrompt =
                  extensionContext.globalState.get<boolean>(
                    "hasSeenSignInPrompt"
                  );
                if (!email && !hasSeenPrompt) {
                  await extensionContext.globalState.update(
                    "hasSeenSignInPrompt",
                    true
                  );
                  const action = await vscode.window.showInformationMessage(
                    "Sign in to enable AI-powered session summaries and shareable cards.",
                    "Sign In"
                  );
                  if (action === "Sign In") {
                    vscode.commands.executeCommand("worktrace.signIn");
                  }
                }
              }
            } catch {
              // non-JSON response
            }
            resolve();
          });
        }
      );
      req.on("error", () => resolve());
      req.on("timeout", () => {
        req.destroy();
        resolve();
      });
    });
  } catch {
    // Backend unreachable — extension works offline
  }
}

export async function getStoredIdToken(
  extensionContext: vscode.ExtensionContext
): Promise<string | null> {
  try {
    const refreshToken = await extensionContext.secrets.get("refreshToken");
    if (!refreshToken) {
      return null;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const apiKey = config.get<string>("firebaseApiKey");
    if (!apiKey) {
      return null;
    }

    return await refreshFirebaseIdToken(refreshToken, apiKey);
  } catch {
    return null;
  }
}

function refreshFirebaseIdToken(
  refreshToken: string,
  apiKey: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const options: https.RequestOptions = {
      hostname: "securetoken.googleapis.com",
      port: 443,
      path: `/v1/token?key=${apiKey}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.id_token || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

export function callBackendContext(
  session: SessionData,
  analysis: SessionAnalysis,
  previousContext: string | null,
  idToken: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const backendUrl =
      config.get<string>("backendUrl") || "http://localhost:3000";

    const payload = JSON.stringify({
      session: {
        branch: session.branch,
        startTime: session.startTime,
        endTime: session.endTime,
        filesTouched: session.filesTouched,
        saveCounts: session.saveCounts,
        fileChangeEvents: session.fileChangeEvents,
        gitDiff: session.gitDiff,
      },
      analysis,
      previousContext,
    });

    const parsed = new URL(`${backendUrl}/api/session/context`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "Content-Length": String(Buffer.byteLength(payload)),
      },
      timeout: 30000,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.context || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

export function callBackendSummarize(
  session: SessionData,
  analysis: SessionAnalysis,
  idToken: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const backendUrl =
      config.get<string>("backendUrl") || "http://localhost:3000";

    const payload = JSON.stringify({
      session: {
        branch: session.branch,
        startTime: session.startTime,
        endTime: session.endTime,
        filesTouched: session.filesTouched,
        saveCounts: session.saveCounts,
        fileChangeEvents: session.fileChangeEvents,
        gitDiff: session.gitDiff,
      },
      analysis,
    });

    const parsed = new URL(`${backendUrl}/api/session/summarize`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "Content-Length": String(Buffer.byteLength(payload)),
      },
      timeout: 30000,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.markdown || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

export function callBackendJson(
  method: string,
  apiPath: string,
  body: Record<string, unknown> | null,
  idToken: string
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const backendUrl =
      config.get<string>("backendUrl") || "http://localhost:3000";

    const payload = body ? JSON.stringify(body) : "";
    const parsed = new URL(`${backendUrl}${apiPath}`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
      },
      timeout: 15000,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

export function callBackendRaw(
  method: string,
  apiPath: string,
  idToken: string
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const backendUrl =
      config.get<string>("backendUrl") || "http://localhost:3000";

    const parsed = new URL(`${backendUrl}${apiPath}`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      timeout: 15000,
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(Buffer.concat(chunks));
        } else {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}
