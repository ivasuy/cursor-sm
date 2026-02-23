import { VertexAI } from "@google-cloud/vertexai";

const projectId = process.env.VERTEX_PROJECT_ID || "";
const location = process.env.VERTEX_LOCATION || "us-central1";
const modelId = process.env.VERTEX_MODEL_NAME || "gemini-2.5-flash";

const vertexAI = new VertexAI({ project: projectId, location });
const model = vertexAI.getGenerativeModel({ model: modelId });

export interface SessionPayload {
  session: {
    branch: string | null;
    startTime: string;
    endTime: string | null;
    filesTouched: string[];
    saveCounts: Record<string, number>;
    fileChangeEvents: {
      file: string;
      eventType: string;
      timestamp: string;
    }[];
    gitDiff: string | null;
  };
  analysis: {
    sessionMode: string;
    confidence: { level: string; explanation: string };
    delta: {
      created: { file: string; content: string[]; fullContent: string }[];
      updated: {
        file: string;
        added: number;
        removed: number;
        addedLines: string[];
        removedLines: string[];
        fullContent: string;
      }[];
      deleted: {
        file: string;
        affectedFiles: { file: string; content: string }[];
      }[];
    };
    frictionPoints: string[];
    tomorrowChecklist: string[];
    explicitlyDidntTouch: string[];
    userNote: string | null;
    primaryFocusFiles: { file: string; reason: string }[];
    intentDescription: string;
  };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "\n... (truncated)" : text;
}

function buildPrompt(payload: SessionPayload): string {
  const { session, analysis } = payload;
  const totalSaves = Object.values(session.saveCounts).reduce(
    (a, b) => a + b,
    0
  );
  const totalAdded = analysis.delta.updated.reduce((s, f) => s + f.added, 0);
  const totalRemoved = analysis.delta.updated.reduce(
    (s, f) => s + f.removed,
    0
  );
  const totalAffectedDeps = analysis.delta.deleted.reduce(
    (s, d) => s + d.affectedFiles.length,
    0
  );

  const createdSection = analysis.delta.created
    .map((f) => {
      const preview = truncate(f.fullContent || f.content.join("\n"), 3000);
      return `### ${f.file} (new file)\n\`\`\`\n${preview}\n\`\`\``;
    })
    .join("\n\n");

  const updatedSection = analysis.delta.updated
    .map((f) => {
      const diffView = [
        ...(f.removedLines.length > 0
          ? [
              `Removed lines:\n${f.removedLines
                .slice(0, 30)
                .map((l) => `- ${l}`)
                .join("\n")}`,
            ]
          : []),
        ...(f.addedLines.length > 0
          ? [
              `Added lines:\n${f.addedLines
                .slice(0, 30)
                .map((l) => `+ ${l}`)
                .join("\n")}`,
            ]
          : []),
      ].join("\n\n");
      const fullCtx = truncate(f.fullContent, 3000);
      return `### ${f.file} (+${f.added}/-${f.removed})\n\nDiff:\n\`\`\`\n${diffView}\n\`\`\`\n\nFull current file:\n\`\`\`\n${fullCtx}\n\`\`\``;
    })
    .join("\n\n");

  const deletedSection = analysis.delta.deleted
    .map((d) => {
      const affectedList =
        d.affectedFiles.length > 0
          ? d.affectedFiles
              .map((a) => {
                const content = truncate(a.content, 2000);
                return `  - **${a.file}** (imports/references this file):\n    \`\`\`\n    ${content}\n    \`\`\``;
              })
              .join("\n")
          : "  No affected files detected.";
      return `### ${d.file} (deleted)\n\nFiles affected by this deletion:\n${affectedList}`;
    })
    .join("\n\n");

  const rawDiffSection = session.gitDiff
    ? `\n## Raw Git Diff\n\`\`\`diff\n${truncate(session.gitDiff, 8000)}\n\`\`\``
    : "";

  const isBigSession =
    session.filesTouched.length >= 8 ||
    totalAdded + totalRemoved >= 500 ||
    totalAffectedDeps >= 6;

  return `You are a senior development-session analyst, security reviewer, and product-minded engineering lead.

Below is a SessionPayload. Your job: produce a single polished Markdown document that feels like a "memory checkpoint for unfinished thinking", NOT a GitHub/PR summary.

ABSOLUTE RULES
- Do NOT output raw diffs verbatim except for short, quoted 5-10 line snippets when needed for security explanations.
- Do NOT restate file-by-file +/- counts as the main content (counts can exist, but not as the point).
- Do NOT speculate beyond the provided code.
- Be concrete: reference real file names, symbols, and patterns only when they appear in the content.
- Keep it human-scaled: never list more than 5 files per subsection; prefer grouping + narrative.

====================================================================
INPUT DATA
====================================================================

## Session Metadata

- **Branch:** ${session.branch || "unknown"}
- **Duration:** ${session.startTime} to ${session.endTime || "ongoing"}
- **Files touched:** ${session.filesTouched.length}
- **Total saves:** ${totalSaves}
- **Total lines added:** ${totalAdded}
- **Total lines removed:** ${totalRemoved}
- **Session Mode:** ${analysis.sessionMode}
- **Deterministic Confidence:** ${analysis.confidence.level} — ${analysis.confidence.explanation}
- **Intent:** ${analysis.intentDescription}

## Created Files (full content)

${createdSection || "None"}

## Updated Files (diff + full current content)

${updatedSection || "None"}

## Deleted Files (with affected dependents)

${deletedSection || "None"}
${rawDiffSection}

## Primary Focus Files
${analysis.primaryFocusFiles.map((f) => `- **${f.file}**: ${f.reason}`).join("\n") || "None"}

## Friction Points (deterministic)
${analysis.frictionPoints.map((p) => `- ${p}`).join("\n")}

## Tomorrow Checklist (deterministic)
${analysis.tomorrowChecklist.map((t) => `- ${t}`).join("\n")}

## What Was Not Touched
${analysis.explicitlyDidntTouch.map((u) => `- ${u}`).join("\n")}

${analysis.userNote ? `## Developer Note\n${analysis.userNote}` : ""}

====================================================================
OUTPUT STRUCTURE (EXACT — follow this order)
====================================================================

# Session Memory

## Snapshot
Compact header block:
- Branch
- Duration
- Session Mode
- Scope (files touched, created/updated/deleted counts, total saves)
- "Work Theme" (1 short phrase derived from the code changes)

## What I Was Trying To Do
2-4 sentences describing intent and why it matters, grounded in actual code.

## Where I Got Stuck / What Slowed Me Down
2-6 bullets rewriting friction points to feel personally useful.
If friction signals are low but code suggests risk/complexity, mention "hidden friction" (e.g., large deletions, refactors) WITHOUT moralizing.

## Confidence & Readiness

### Readiness Score (0-100)
- 90-100: shippable
- 70-89: close, small cleanup
- 40-69: risky / incomplete
- 0-39: exploratory / unstable

### Why This Score
3-6 bullets referencing evidence from code:
- uncommitted diff size
- removed vs added ratio
- presence of TODO/FIXME/HACK
- console logs / debug flags
- deletion impact (deleted components used elsewhere)
- tests touched or not
- config/auth/security sensitive areas changed
- session ends right after large edits (unfinished signal)

### Ship / Split / Pause Recommendation
Choose exactly ONE of: Ship now | Split into smaller commits first | Pause and stabilize before committing.
Justify in 1-2 lines.

## What Changed (Meaning, Not Diff)
Explain conceptual changes grouped by theme: UI/UX behavior, auth/session, data flow, layout/components, tooling/config.
Use evidence from code: imports, new components, removed hooks, route/page changes, etc.
NO raw diff dump.

## Security & Vulnerability Check

### Potential Risks Found
0-8 items. Only include if justifiable from the code. Look for:
- unsanitized user input rendered into the DOM
- dangerouslySetInnerHTML usage
- direct use of query params in auth flows
- missing CSRF protections
- leaking secrets via console.log
- insecure redirects / open redirect patterns
- exposing internal error messages
- missing validation on server actions / API routes
- weak auth/session handling patterns
- insecure storage of tokens (localStorage for auth, etc.)
- overly permissive CORS or headers

### How To Fix / Harden
Concrete fix strategy for each risk found.
If no risks: say "No obvious security issues detected from provided code" and provide 2-3 general hardening reminders relevant to the changed areas.

### Regression Traps
Likely breakpoints from deletions/large removals: deleted components referenced elsewhere, layout changes affecting boundaries, etc.

## Tomorrow, First 10 Minutes
Numbered checklist (5-10 items max), highly actionable:
- reopen the true "primary focus file"
- address the highest security risk (if any)
- add/adjust tests if applicable
- cleanup tasks (remove console logs, tighten imports)
- decide commit strategy

## What I Deliberately Didn't Touch
Short bullets that reduce anxiety (tests/docs/config/auth/back-end untouched — only if supported by file set).

${isBigSession ? `## Feature/Outcome Map
(Include this section because this is a big session: ${session.filesTouched.length} files touched, ${totalAdded + totalRemoved} lines changed, ${totalAffectedDeps} affected dependents.)

### What You Can Claim As "Done"
3-7 bullets phrased like outcomes (not code changes).

### What's Half-Done / Risky
3-7 bullets.

### Suggested Commit Slices
2-5 suggested commit groupings by theme (UI, cleanup, deletion, refactor).` : "(Omit Feature/Outcome Map — session is not large enough to warrant it.)"}

## My Note
Include only if developer note was provided above.

## One-Line Shareable Update
One sentence that the developer can paste to X/LinkedIn/Slack.

====================================================================
QUALITY RULES
====================================================================
- Do not be generic. If you cannot ground a statement in code, don't include it.
- Prefer "because X changed in file Y" style reasoning.
- If huge deletions happened, explicitly assess whether this is a refactor, cleanup, or breaking change risk.
- When security checks are relevant (signin/signup pages, auth flows, redirects), be extra careful.
- Keep the tone: first-person developer writing to their future self, professional but not corporate.

Now generate the Markdown "Session Memory" document.`;
}

export async function generateSummary(
  payload: SessionPayload
): Promise<string> {
  const prompt = buildPrompt(payload);

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response generated from Vertex AI.");
  }

  return text;
}
