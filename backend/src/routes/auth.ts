import { Router } from "express";

export const authRouter = Router();

const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_PROJECT_ID || "",
  appId: process.env.FIREBASE_APP_ID || "",
};

const EXTENSION_URI_SCHEME =
  process.env.EXTENSION_URI_SCHEME ||
  "vscode://local.cursor-session-tracker";

/**
 * Serves an HTML page that handles Google Sign-In using Firebase Client SDK.
 * After sign-in, redirects back to the VS Code extension with tokens.
 */
authRouter.get("/google", (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in - Cursor Session Tracker</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #0d1117;
      color: #c9d1d9;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 48px;
      text-align: center;
      max-width: 400px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: #f0f6fc; }
    p { margin-bottom: 32px; color: #8b949e; font-size: 14px; }
    button {
      background: #238636;
      color: #fff;
      border: none;
      padding: 12px 32px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #2ea043; }
    button:disabled { background: #484f58; cursor: wait; }
    .status { margin-top: 16px; font-size: 13px; color: #8b949e; }
    .error { color: #f85149; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Cursor Session Tracker</h1>
    <p>Sign in with your Google account to enable AI-powered session summaries.</p>
    <button id="signInBtn" onclick="signIn()">Sign in with Google</button>
    <div id="status" class="status"></div>
  </div>

  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <script>
    firebase.initializeApp(${JSON.stringify(FIREBASE_CONFIG)});

    async function signIn() {
      const btn = document.getElementById('signInBtn');
      const status = document.getElementById('status');
      btn.disabled = true;
      status.textContent = 'Opening Google sign-in...';
      status.className = 'status';

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebase.auth().signInWithPopup(provider);
        const user = result.user;
        const idToken = await user.getIdToken();
        const refreshToken = user.refreshToken;

        status.textContent = 'Redirecting to Cursor...';

        const params = new URLSearchParams({
          idToken,
          refreshToken,
          email: user.email || '',
          userId: user.uid,
        });

        window.location.href =
          '${EXTENSION_URI_SCHEME}/auth-callback?' + params.toString();
      } catch (error) {
        status.textContent = 'Sign-in failed: ' + (error.message || error);
        status.className = 'status error';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});
