# Cursor Session Tracker

**Track your coding sessions. Get AI-powered summaries. Share your progress.**

Cursor Session Tracker is a VS Code / Cursor extension that silently records what you work on during a coding session — file changes, save patterns, git diffs, friction points — and turns it into a structured summary you can use as a personal development log, standup note, or shareable proof of work.

> Works with any language or framework. TypeScript, Python, Go, Rust, Java, Solidity, and everything else.

---

## Features

### Automatic Session Tracking
The extension runs in the background from the moment you open a project. It tracks file creates, saves, deletes, open/edit events, and captures your git diff and branch at session end. No manual setup required.

### Structured Session Summaries
End your session with a single command and get a detailed Markdown summary including:
- **Session mode** — were you exploring, iterating, debugging, or in deep focus?
- **Where you got stuck** — friction points detected from rapid saves, long gaps, and create-delete cycles
- **What changed** — grouped by theme, not raw diffs
- **Readiness score** — how shippable is your work right now?
- **Tomorrow checklist** — actionable next steps for your next session
- **What you didn't touch** — tests, docs, config that stayed untouched (so you don't worry about them)

### AI-Enhanced Summaries
Sign in with Google to unlock AI-powered summaries via Vertex AI (Gemini). The AI reads your full file context — not just diffs — and produces a polished "session memory" document that feels like a checkpoint written by your future self.

Without sign-in, you still get a complete deterministic summary. The AI layer is optional.

### Shareable Session Cards
After your first session of the day, Cursor Session Tracker generates a shareable image card showing:
- Lines added / removed
- Files changed
- Your coding streak
- Branch name and date
- Your display name

Upload it to X, LinkedIn, or Slack as proof that you shipped today. Branded with **Worktrace**.

### Personal Session Notes
Add notes during your session via the Command Palette ("Add Session Note"). These appear in your summary under "My Note" — useful for capturing intent, blockers, or decisions that code alone can't explain.

---

## Sign In / Sign Up

AI-powered summaries and shareable session cards require a free account. You can sign up at any time — there are three ways:

1. **Status bar** — Click the "Session Tracker" item in the bottom-right of your editor (shows "Not signed in" when logged out).
2. **Command Palette** — Run **"Session Tracker: Sign In with Google"** (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3. **End-session prompt** — When you end a session without being signed in, the extension will offer a "Sign In" button.

All three open a Google Sign-In page in your browser. After signing in, you're automatically redirected back to your editor — no extra steps needed.

> Already have an account? The same flow handles both sign-up and sign-in.

---

## How to Use

### 1. Install the Extension
Install from a `.vsix` file or through the VS Code / Cursor marketplace (when published).

### 2. Open Any Project
Tracking starts automatically when you open a workspace. You'll see a "Session Tracker" indicator in the status bar.

### 3. Code Normally
Write code, save files, create and delete files, switch between tabs. The extension records everything relevant in the background.

### 4. Add Notes (Optional)
Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run **"Add Session Note"** to attach a note to the current session.

### 5. End Your Session
Open the Command Palette and run **"End Session & Generate Summary"**. A Markdown summary file opens in your editor, saved to `.cursor-sessions/` in your project root.

### 6. Sign In for AI Summaries (Optional)
Click the status bar item or run **"Session Tracker: Sign In with Google"** from the Command Palette. Once signed in, your next session summary will be AI-enhanced with full code context analysis.

### 7. Set Your Display Name
Run **"Session Tracker: Set Display Name"** to set the name shown on your shareable session cards.

### 8. Share Your Card
After your first session of the day, a shareable card image is generated and saved to `.cursor-sessions/`. Upload it to social media or share with your team.

---

## Video Guides

### Getting Started
<!-- TODO: Add video walkthrough of installing the extension and generating your first summary -->
_Coming soon_

### AI-Powered Summaries
<!-- TODO: Add video showing the difference between local and AI summaries -->
_Coming soon_

### Sharing Your Session Card
<!-- TODO: Add video demonstrating the shareable card feature and posting to X -->
_Coming soon_

### Adding Session Notes
<!-- TODO: Add video showing how to add notes during a session -->
_Coming soon_

---

## Commands

| Command | Description |
|---------|-------------|
| **End Session & Generate Summary** | Stop tracking and produce a session summary |
| **Add Session Note** | Attach a personal note to the current session |
| **Session Tracker: Sign In with Google** | Sign in to enable AI summaries and session cards |
| **Session Tracker: Sign Out** | Sign out of your account |
| **Session Tracker: Set Display Name** | Set the name displayed on your shareable cards |
| **Session Tracker: Generate Shareable Card** | Generate a shareable card for any date with sessions |

---

## Session Output

Summaries are saved to `.cursor-sessions/` in your project:

```
.cursor-sessions/
  session-2026-02-23_14-30-00.md
  session-2026-02-22_09-15-00.md
  card-2026-02-23.png
```

Each summary is a standalone Markdown document. Card images are PNG files sized for social media.

---

## Setup & Configuration

For installation instructions, backend setup, environment variables, deployment, and Firestore rules, see the [Setup Guide](docs/setup.md).

For architecture details and data flow, see [Architecture](docs/architecture.md).

For a deep dive on tracked signals and summary sections, see [Feature Overview](docs/overview.md).

---

## License

MIT
