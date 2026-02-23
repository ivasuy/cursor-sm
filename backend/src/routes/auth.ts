import { Router } from "express";

export const authRouter = Router();

const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_PROJECT_ID || "",
  appId: process.env.FIREBASE_APP_ID || "",
};

authRouter.get("/google", (req, res) => {
  const schemeFromQuery = (req.query.scheme as string) || "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Get Started - Worktrace</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      background: #0a0a0a;
      color: #e0e0e0;
    }

    .container {
      display: flex;
      width: 100%;
      min-height: 100vh;
    }

    /* Left Panel - Branding */
    .left-panel {
      width: 40%;
      background: linear-gradient(180deg, #0a0a0a 0%, #0d0d0d 50%, #121210 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 48px;
      position: relative;
      overflow: hidden;
    }

    .left-panel::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: 
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(255,255,255,0.01) 2px,
          rgba(255,255,255,0.01) 4px
        );
      pointer-events: none;
    }

    .pixel-grid {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 24px 24px;
      pointer-events: none;
    }

    .glow-orb {
      position: absolute;
      width: 300px;
      height: 300px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(80,80,80,0.15) 0%, transparent 70%);
      bottom: -100px;
      left: -50px;
      filter: blur(40px);
    }

    .brand-content {
      position: relative;
      z-index: 1;
      text-align: center;
    }

    .brand-logo {
      width: 80px;
      height: 80px;
      margin-bottom: 32px;
      image-rendering: pixelated;
      filter: drop-shadow(0 0 20px rgba(255,255,255,0.1));
    }

    .brand-tagline {
      font-family: 'Press Start 2P', monospace;
      font-size: 14px;
      line-height: 2;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .brand-tagline .highlight {
      color: #fff;
      display: block;
      font-size: 16px;
      margin-top: 16px;
    }

    /* Right Panel - Form */
    .right-panel {
      width: 60%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 48px;
      background: #0d0d0d;
    }

    .form-card {
      width: 100%;
      max-width: 420px;
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 48px;
      box-shadow: 
        0 4px 24px rgba(0,0,0,0.4),
        inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .form-header {
      text-align: center;
      margin-bottom: 40px;
    }

    .form-logo {
      width: 48px;
      height: 48px;
      margin-bottom: 24px;
      image-rendering: pixelated;
    }

    .form-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 18px;
      color: #fff;
      margin-bottom: 12px;
    }

    .form-subtitle {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
    }

    .form-subtitle .journey {
      color: #888;
      font-weight: 500;
    }

    .sign-in-btn {
      width: 100%;
      padding: 16px 24px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .sign-in-btn:hover {
      background: rgba(255,255,255,0.12);
      border-color: rgba(255,255,255,0.25);
      transform: translateY(-1px);
    }

    .sign-in-btn:active {
      transform: translateY(0);
    }

    .sign-in-btn:disabled {
      opacity: 0.5;
      cursor: wait;
      transform: none;
    }

    .sign-in-btn svg {
      width: 20px;
      height: 20px;
    }

    .status-message {
      text-align: center;
      font-size: 13px;
      color: #666;
      min-height: 20px;
      margin-top: 8px;
    }

    .status-message.error {
      color: #e74c3c;
    }

    .status-message.success {
      color: #27ae60;
    }

    .divider {
      display: flex;
      align-items: center;
      margin: 24px 0;
      color: #444;
      font-size: 12px;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(255,255,255,0.1);
    }

    .divider span {
      padding: 0 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .features-list {
      list-style: none;
      padding: 0;
    }

    .features-list li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      font-size: 13px;
      color: #777;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .features-list li:last-child {
      border-bottom: none;
    }

    .features-list .icon {
      width: 16px;
      height: 16px;
      color: #555;
    }

    .footer-note {
      margin-top: 32px;
      text-align: center;
      font-size: 11px;
      color: #444;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .container {
        flex-direction: column;
      }
      .left-panel {
        width: 100%;
        min-height: 200px;
        padding: 32px;
      }
      .right-panel {
        width: 100%;
        padding: 32px;
      }
      .form-card {
        padding: 32px;
      }
      .brand-tagline {
        font-size: 11px;
      }
      .brand-tagline .highlight {
        font-size: 13px;
      }
    }

    /* Loading animation */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .loading {
      animation: pulse 1.5s infinite;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="left-panel">
      <div class="pixel-grid"></div>
      <div class="glow-orb"></div>
      <div class="brand-content">
        <img src="/static/icon.png" alt="Worktrace" class="brand-logo" />
        <p class="brand-tagline">
          Track your code
          <span class="highlight">Welcome to the journey</span>
        </p>
      </div>
    </div>

    <div class="right-panel">
      <div class="form-card">
        <div class="form-header">
          <img src="/static/icon.png" alt="Worktrace" class="form-logo" />
          <h1 class="form-title">Get Started</h1>
          <p class="form-subtitle">
            <span class="journey">Welcome to Worktrace</span><br/>
            AI-powered session summaries await
          </p>
        </div>

        <button id="signInBtn" class="sign-in-btn" onclick="signIn()">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <div id="status" class="status-message"></div>

        <div class="divider"><span>What you get</span></div>

        <ul class="features-list">
          <li>
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            AI-powered session summaries
          </li>
          <li>
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            Shareable session cards
          </li>
          <li>
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Track your coding streak
          </li>
        </ul>

        <p class="footer-note">
          Free tier includes 50 AI summaries/month
        </p>
      </div>
    </div>
  </div>

  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <script>
    const firebaseConfig = ${JSON.stringify(FIREBASE_CONFIG)};
    const scheme = '${schemeFromQuery}' || 'cursor';

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    async function signIn() {
      const btn = document.getElementById('signInBtn');
      btn.disabled = true;
      btn.classList.add('loading');
      showStatus('Opening Google sign-in...', '');

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);

        if (!result || !result.user) {
          throw new Error('No user returned from sign-in');
        }

        const user = result.user;
        showStatus('Completing sign-in...', '');

        const idToken = await user.getIdToken();
        const refreshToken = user.refreshToken;

        const params = new URLSearchParams({
          idToken,
          refreshToken,
          email: user.email || '',
          userId: user.uid,
        });

        const callbackUrl = scheme + '://local.cursor-session-tracker/auth-callback?' + params.toString();

        document.querySelector('.form-card').innerHTML = \`
          <div class="form-header">
            <img src="/static/icon.png" alt="Worktrace" class="form-logo" />
            <h1 class="form-title" style="color: #27ae60;">Success!</h1>
            <p class="form-subtitle">
              Signed in as <strong>\${user.email || 'user'}</strong>
            </p>
          </div>
          <p style="text-align: center; color: #888; margin: 24px 0 16px;">
            Redirecting back to your editor...
          </p>
          <a href="\${callbackUrl}" class="sign-in-btn" style="text-decoration: none;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px;height:20px;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            Open in Editor
          </a>
          <p class="footer-note" style="margin-top: 24px;">
            If you are not redirected automatically, click the button above.<br/>
            You can close this tab after returning to your editor.
          </p>
        \`;

        window.location.href = callbackUrl;

      } catch (error) {
        console.error('Sign-in error:', error);
        if (error.code === 'auth/popup-closed-by-user') {
          showStatus('Sign-in cancelled. Click the button to try again.', '');
        } else {
          showStatus('Sign-in failed: ' + (error.message || 'Unknown error'), 'error');
        }
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }

    function showStatus(message, type) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.className = 'status-message' + (type ? ' ' + type : '');
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});
