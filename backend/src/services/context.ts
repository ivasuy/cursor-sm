import { VertexAI } from "@google-cloud/vertexai";
import { SessionPayload } from "./vertex";

const projectId = process.env.VERTEX_PROJECT_ID || "";
const location = process.env.VERTEX_LOCATION || "us-central1";
const modelId = process.env.VERTEX_MODEL_NAME || "gemini-2.5-flash";

const vertexAI = new VertexAI({ project: projectId, location });
const model = vertexAI.getGenerativeModel({ model: modelId });

export interface ContextPayload {
  session: SessionPayload["session"];
  analysis: SessionPayload["analysis"];
  previousContext: string | null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "\n... (truncated)" : text;
}

function buildContextPrompt(payload: ContextPayload): string {
  const { session, analysis, previousContext } = payload;

  const totalAdded = analysis.delta.updated.reduce((s, f) => s + f.added, 0);
  const totalRemoved = analysis.delta.updated.reduce(
    (s, f) => s + f.removed,
    0
  );

  const fileList = session.filesTouched
    .slice(0, 20)
    .map((f) => `- ${f}`)
    .join("\n");

  const createdFiles = analysis.delta.created
    .map((f) => {
      const preview = truncate(f.fullContent || f.content.join("\n"), 2000);
      return `### ${f.file} (new)\n\`\`\`\n${preview}\n\`\`\``;
    })
    .join("\n\n");

  const updatedFiles = analysis.delta.updated
    .map((f) => {
      const added = f.addedLines.slice(0, 20).map((l) => `+ ${l}`).join("\n");
      const removed = f.removedLines.slice(0, 20).map((l) => `- ${l}`).join("\n");
      return `### ${f.file} (+${f.added}/-${f.removed})\n\`\`\`diff\n${removed}\n${added}\n\`\`\``;
    })
    .join("\n\n");

  const deletedFiles = analysis.delta.deleted
    .map((d) => `- ~~${d.file}~~ (affected: ${d.affectedFiles.map((a) => a.file).join(", ") || "none"})`)
    .join("\n");

  return `You are a project context engineer. Your job is to maintain a living project context document that helps ANY AI coding assistant (Claude, Cursor, Copilot, Gemini, Codex) understand this project deeply.

This is NOT a session summary. A session summary describes what happened in one session. This context document is a persistent, evolving knowledge base that accumulates across sessions. Think of it as the project's working memory.

====================================================================
RULES
====================================================================

1. Output ONLY the context document in the exact structure below. No preamble.
2. MERGE new information with the previous context — don't discard what's still relevant.
3. Remove entries that are clearly stale (completed tasks, resolved issues, deleted modules).
4. Be concrete: use real file names, function names, and variable names from the code.
5. Keep it compact — this will be injected into AI context windows. Every token counts.
6. Write in present tense, third person. No narrative, no opinions, just facts.
7. Architecture decisions should capture the DECISION and the WHY, not just what exists.

====================================================================
PREVIOUS CONTEXT (merge with new session data)
====================================================================

${previousContext || "(No previous context — this is the first session.)"}

====================================================================
THIS SESSION'S DATA
====================================================================

## Session Metadata
- Branch: ${session.branch || "unknown"}
- Duration: ${session.startTime} to ${session.endTime || "ongoing"}
- Mode: ${analysis.sessionMode}
- Intent: ${analysis.intentDescription}
- Files touched: ${session.filesTouched.length} (+${totalAdded}/-${totalRemoved})
- Confidence: ${analysis.confidence.level} — ${analysis.confidence.explanation}

## Files Touched
${fileList}

## Created Files
${createdFiles || "None"}

## Updated Files (key changes)
${updatedFiles || "None"}

## Deleted Files
${deletedFiles || "None"}

## Friction Points
${analysis.frictionPoints.map((p) => `- ${p}`).join("\n")}

## Pending Items
${analysis.tomorrowChecklist.map((t) => `- ${t}`).join("\n")}

## What Was Not Touched
${analysis.explicitlyDidntTouch.map((u) => `- ${u}`).join("\n")}

${analysis.userNote ? `## Developer Note\n${analysis.userNote}` : ""}

====================================================================
OUTPUT STRUCTURE (exact format — follow precisely)
====================================================================

# Project Context

## Architecture Decisions
Numbered list of key architectural choices made in this project. Each entry:
- **What** was decided (e.g., "Extension uses multi-file module structure")
- **Why** (e.g., "to keep session tracking, analysis, and rendering independent")
- Include decisions visible from imports, file structure, framework choices, API design.
- Keep decisions from previous context that are still valid. Add new ones from this session.
- Max 15 entries. Prioritize recent and high-impact decisions.

## Key Modules & Files
Table with columns: Module/File | Purpose | Key Exports/Functions
- Cover the critical files that an AI assistant needs to know about to be useful.
- Update based on what was created/modified/deleted this session.
- Max 20 entries.

## Current Roadmap
What's actively being worked on, based on evidence from this and previous sessions:
- **In Progress**: Features/changes actively being built (evidence: recent file changes, branch names, intent)
- **Next Up**: Items from tomorrow checklists and pending items that haven't been started
- **Recently Completed**: Items that were in progress but appear done now
- Max 5 items per category.

## What Failed / What to Avoid
Things that went wrong, caused friction, or should not be repeated:
- Failed approaches (from friction points across sessions)
- Known gotchas in the codebase
- Patterns that caused bugs or regressions
- Keep entries from previous context that are still relevant.
- Max 10 entries.

## Next Steps
Ordered, actionable list of what to do next. Synthesized from:
- Tomorrow checklist items
- Incomplete work from friction points
- Logical next steps based on what changed
- Max 8 items.

## Active Branch Context
- Current branch: name and what it's for
- Recent branches (if relevant)
- Any cross-branch concerns

====================================================================
QUALITY CHECK
====================================================================
- Every entry must be grounded in actual code/files from the input.
- No generic advice ("write tests", "add docs") unless specifically evidenced.
- If merging with previous context, clearly evolve it — don't just append blindly.
- The document should be useful if pasted into ANY AI tool's system prompt.

Now generate the context document.`;
}

export async function generateContext(
  payload: ContextPayload
): Promise<string> {
  const prompt = buildContextPrompt(payload);

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No context generated from Vertex AI.");
  }

  return text;
}
