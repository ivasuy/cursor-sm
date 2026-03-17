import * as path from "path";
import { SessionMemory } from "./types";

/**
 * Generates a structured context block from session memory.
 * This block can be pasted into any AI tool (Cursor, Claude Code, Codex, etc.)
 * to give the AI awareness of recent session history.
 */
export function generateContextBlock(
  memory: SessionMemory,
  projectName: string
): string {
  const lines: string[] = [];

  lines.push(`# Worktrace Context: ${projectName}`);
  lines.push(`> Auto-generated session context. ${memory.totalSessions} sessions tracked.`);
  lines.push("");

  // Last session summary
  if (memory.lastSession) {
    const last = memory.lastSession;
    const endDate = new Date(last.endTime).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    lines.push("## Where I Left Off");
    lines.push("");
    lines.push(`- **Last session ended:** ${endDate}`);
    lines.push(`- **Branch:** \`${last.branch || "unknown"}\``);
    lines.push(`- **Mode:** ${last.sessionMode}`);
    lines.push(`- **Confidence:** ${last.confidence}`);
    lines.push(`- **What I was doing:** ${last.intentDescription}`);

    if (last.filesTouched.length > 0) {
      const topFiles = last.filesTouched.slice(0, 5);
      lines.push(`- **Files touched:** ${topFiles.map((f) => `\`${path.basename(f)}\``).join(", ")}${last.filesTouched.length > 5 ? ` (+${last.filesTouched.length - 5} more)` : ""}`);
    }
    lines.push("");
  }

  // Open TODOs from last session
  if (memory.openTodos.length > 0) {
    lines.push("## Pick Up Where You Left Off");
    lines.push("");
    memory.openTodos.forEach((todo, i) => {
      lines.push(`${i + 1}. ${todo}`);
    });
    lines.push("");
  }

  // Churn hotspots
  if (memory.churnHotspots.length > 0) {
    lines.push("## Churn Hotspots (frequently modified files)");
    lines.push("");
    lines.push("These files appear across many sessions and may need attention:");
    lines.push("");
    memory.churnHotspots.forEach((h) => {
      lines.push(`- \`${h.file}\` — ${h.sessionCount} sessions, ${h.totalSaves} total saves`);
    });
    lines.push("");
  }

  // Recurring friction
  if (memory.recurringFriction.length > 0) {
    lines.push("## Recurring Friction");
    lines.push("");
    lines.push("These patterns keep appearing across sessions:");
    lines.push("");
    memory.recurringFriction.forEach((f) => {
      lines.push(`- ${f}`);
    });
    lines.push("");
  }

  // Recent branches
  if (memory.recentBranches.length > 0) {
    lines.push("## Recent Branches");
    lines.push("");
    lines.push(memory.recentBranches.map((b) => `\`${b}\``).join(", "));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generates context in CLAUDE.md format — suitable for appending
 * to a project's CLAUDE.md or using as a standalone context file.
 */
export function generateClaudeMdBlock(
  memory: SessionMemory,
  projectName: string
): string {
  const lines: string[] = [];

  lines.push("## Worktrace Session Context");
  lines.push("");

  if (memory.lastSession) {
    const last = memory.lastSession;
    lines.push(`Last session: ${last.intentDescription} on branch \`${last.branch || "unknown"}\` (${last.sessionMode}, ${last.confidence} confidence).`);
    lines.push("");

    if (memory.openTodos.length > 0) {
      lines.push("Pending from last session:");
      memory.openTodos.forEach((todo) => {
        lines.push(`- ${todo}`);
      });
      lines.push("");
    }
  }

  if (memory.churnHotspots.length > 0) {
    lines.push("Frequently modified files (handle with care):");
    memory.churnHotspots.slice(0, 5).forEach((h) => {
      lines.push(`- \`${h.file}\` (${h.sessionCount} sessions)`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generates context in .cursorrules format.
 */
export function generateCursorRulesBlock(
  memory: SessionMemory,
  projectName: string
): string {
  const lines: string[] = [];

  lines.push(`# Worktrace context for ${projectName}`);
  lines.push("");

  if (memory.lastSession) {
    const last = memory.lastSession;
    lines.push(`## Recent work`);
    lines.push(`Last session: ${last.intentDescription}`);
    lines.push(`Branch: ${last.branch || "unknown"}`);
    lines.push(`Confidence: ${last.confidence}`);
    lines.push("");
  }

  if (memory.openTodos.length > 0) {
    lines.push("## Pending tasks");
    memory.openTodos.forEach((todo) => {
      lines.push(`- ${todo}`);
    });
    lines.push("");
  }

  if (memory.churnHotspots.length > 0) {
    lines.push("## High-churn files (be careful with these)");
    memory.churnHotspots.slice(0, 5).forEach((h) => {
      lines.push(`- ${h.file}`);
    });
    lines.push("");
  }

  if (memory.recurringFriction.length > 0) {
    lines.push("## Known friction areas");
    memory.recurringFriction.forEach((f) => {
      lines.push(`- ${f}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}
