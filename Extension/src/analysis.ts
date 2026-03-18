import * as vscode from "vscode";
import * as path from "path";
import {
  SessionData,
  DiffFileSummary,
  SessionDelta,
  SessionAnalysis,
  ConfidenceLevel,
  WorkIntent,
  FileCategory,
  CodeChangeSummary,
} from "./types";
import { classifyFile, groupFilesByCategory } from "./file-utils";
import { parseGitDiffByFile } from "./git";
import { buildSessionDelta } from "./delta-builder";

export async function analyzeSession(
  session: SessionData,
  extensionContext: vscode.ExtensionContext
): Promise<SessionAnalysis> {
  const diffSummaries = parseGitDiffByFile(session.gitDiff);
  const { description } = detectWorkIntent(session);
  const rankedFiles = rankFilesByImportance(session, diffSummaries);
  const primaryFiles = rankedFiles.slice(0, 5);

  const delta = await buildSessionDelta(session, diffSummaries);
  const sessionMode = detectSessionMode(session);
  const confidence = computeSessionConfidence(session, diffSummaries);
  const frictionPoints = detectFrictionPoints(session);
  const tomorrowChecklist = buildTomorrowChecklist(session, diffSummaries);
  const explicitlyDidntTouch = inferWhatIDidntTouch(session);

  const notes = extensionContext.workspaceState.get<string[]>(
    "sessionNotes",
    []
  );
  const userNote = notes.length > 0 ? notes.join("\n\n") : null;

  return {
    sessionMode,
    confidence,
    delta,
    frictionPoints,
    tomorrowChecklist,
    explicitlyDidntTouch,
    userNote,
    primaryFocusFiles: primaryFiles,
    intentDescription: description,
  };
}

function detectSessionMode(session: SessionData): string {
  const events = session.fileChangeEvents;
  if (events.length === 0) {
    return "Minimal Activity";
  }
  if (events.length <= 3) {
    return "Quick Sprint";
  }

  const timestamps = events.map((e) => Date.parse(e.timestamp));
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  const duration = end - start;

  if (duration < 120000) {
    return "Quick Sprint";
  }

  const thirdDuration = duration / 3;

  function labelPhase(
    phaseEvents: SessionData["fileChangeEvents"]
  ): string {
    if (phaseEvents.length === 0) {
      return "Paused";
    }
    const saves = phaseEvents.filter((e) => e.eventType === "save").length;
    const creates = phaseEvents.filter(
      (e) => e.eventType === "create"
    ).length;
    const deletes = phaseEvents.filter(
      (e) => e.eventType === "delete"
    ).length;
    const uniqueFiles = new Set(phaseEvents.map((e) => e.file)).size;

    if (creates >= 2 && deletes >= 1) {
      return "Experimentation";
    }
    if (creates >= 3) {
      return "Scaffolding";
    }
    if (uniqueFiles >= 5 && saves <= uniqueFiles) {
      return "Exploration";
    }
    if (saves >= 5 && uniqueFiles <= 2) {
      return "Deep Focus";
    }
    if (saves >= 3) {
      return "Iteration";
    }
    return "Exploration";
  }

  const phases: string[] = [];
  for (let i = 0; i < 3; i++) {
    const phaseStart = start + thirdDuration * i;
    const phaseEnd = start + thirdDuration * (i + 1);
    const phaseEvents = events.filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= phaseStart && (i === 2 ? t <= phaseEnd : t < phaseEnd);
    });
    phases.push(labelPhase(phaseEvents));
  }

  const lastThirdCount = events.filter(
    (e) => Date.parse(e.timestamp) >= start + thirdDuration * 2
  ).length;
  const middleThirdCount = events.filter((e) => {
    const t = Date.parse(e.timestamp);
    return t >= start + thirdDuration && t < start + thirdDuration * 2;
  }).length;

  if (
    lastThirdCount > 0 &&
    middleThirdCount > 0 &&
    lastThirdCount < middleThirdCount / 2
  ) {
    phases[2] = "Winding Down";
  }

  const deduped: string[] = [phases[0]];
  for (let i = 1; i < phases.length; i++) {
    if (phases[i] !== phases[i - 1]) {
      deduped.push(phases[i]);
    }
  }

  return deduped.join(" \u2192 ");
}

function detectFrictionPoints(session: SessionData): string[] {
  const points: string[] = [];

  for (const [file, count] of Object.entries(session.saveCounts)) {
    if (count >= 5) {
      points.push(
        `Iterated heavily on \`${path.basename(file)}\` (${count} saves) \u2014 likely resolving uncertainty.`
      );
    }
  }

  const saveEvents = session.fileChangeEvents.filter(
    (e) => e.eventType === "save"
  );
  if (saveEvents.length >= 3) {
    const saveTimes = saveEvents
      .map((e) => ({ time: Date.parse(e.timestamp), file: e.file }))
      .sort((a, b) => a.time - b.time);
    for (let i = 0; i < saveTimes.length - 2; i++) {
      const windowMs = saveTimes[i + 2].time - saveTimes[i].time;
      if (windowMs < 60000) {
        const burstFile = saveTimes[i].file;
        const burstCount = saveTimes.filter(
          (s) => s.time >= saveTimes[i].time && s.time <= saveTimes[i].time + 60000
        ).length;
        const windowSec = Math.round(windowMs / 1000);
        const msg = `Rapid save burst on \`${path.basename(burstFile)}\` (${burstCount} saves in ${windowSec}s) \u2014 suggests trial-and-error.`;
        if (!points.includes(msg)) {
          points.push(msg);
        }
        break;
      }
    }
  }

  const createdFiles = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "create")
      .map((e) => e.file)
  );
  const deletedFiles = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "delete")
      .map((e) => e.file)
  );
  const cycled = [...createdFiles].filter((f) => deletedFiles.has(f));
  if (cycled.length > 0) {
    points.push(
      "Created and deleted files \u2014 suggests trying different approaches."
    );
  }

  const sortedEvents = [...session.fileChangeEvents].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  for (let i = 1; i < sortedEvents.length; i++) {
    const gapMinutes =
      (Date.parse(sortedEvents[i].timestamp) -
        Date.parse(sortedEvents[i - 1].timestamp)) /
      60000;
    if (gapMinutes > 10) {
      const before = path.basename(sortedEvents[i - 1].file);
      const after = path.basename(sortedEvents[i].file);
      const context =
        before === after
          ? `while working on \`${before}\``
          : `between \`${before}\` and \`${after}\``;
      points.push(
        `${Math.round(gapMinutes)}-minute gap ${context} \u2014 possible debugging or deep thinking.`
      );
      break;
    }
  }

  if (points.length === 0) {
    points.push("No significant friction detected \u2014 smooth session.");
  }

  return points;
}

function buildTomorrowChecklist(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): string[] {
  const checklist: string[] = [];

  if (session.fileChangeEvents.length > 0) {
    const lastEvent =
      session.fileChangeEvents[session.fileChangeEvents.length - 1];
    checklist.push(
      `Reopen \`${lastEvent.file}\` \u2014 last edited file.`
    );
  }

  const filesWithDebugLogs = diffSummaries
    .filter((d) =>
      d.addedLines.some((line) =>
        /console\.log|console\.debug|print\(|System\.out\.print/i.test(line)
      )
    )
    .map((d) => path.basename(d.file));
  if (filesWithDebugLogs.length > 0) {
    checklist.push(
      `Remove debug statements from: ${filesWithDebugLogs.join(", ")}.`
    );
  }

  const filesWithTodos = diffSummaries
    .filter((d) =>
      d.addedLines.some((line) => /TODO|FIXME|HACK|XXX/i.test(line))
    )
    .map((d) => path.basename(d.file));
  if (filesWithTodos.length > 0) {
    checklist.push(
      `Address TODO/FIXME markers in: ${filesWithTodos.join(", ")}.`
    );
  }

  const totalChanges = diffSummaries.reduce(
    (sum, d) => sum + d.added + d.removed,
    0
  );
  if (totalChanges > 200) {
    checklist.push(
      `Review ${totalChanges} uncommitted line changes \u2014 consider committing or splitting.`
    );
  }

  if (checklist.length === 0) {
    checklist.push(
      "Pick up where you left off \u2014 session looks clean."
    );
  }

  return checklist;
}

function inferWhatIDidntTouch(session: SessionData): string[] {
  const untouched: string[] = [];
  const categories = groupFilesByCategory(session.filesTouched);

  if (categories.Test.length === 0) {
    untouched.push("Tests were not modified.");
  }
  if (categories.Docs.length === 0) {
    untouched.push("Documentation was not updated.");
  }
  if (categories.Config.length === 0) {
    untouched.push("Configuration files were not changed.");
  }
  if (categories.UI.length === 0) {
    untouched.push("UI/styling was not modified.");
  }

  if (untouched.length === 0) {
    untouched.push("Session covered all major areas.");
  }

  return untouched;
}

function computeSessionConfidence(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): { level: ConfidenceLevel; explanation: string } {
  let score = 50;
  const reasons: string[] = [];

  const todoCount = diffSummaries.reduce(
    (sum, d) =>
      sum + d.addedLines.filter((l) => /TODO|FIXME/i.test(l)).length,
    0
  );
  if (todoCount > 0) {
    score -= todoCount * 5;
    reasons.push(`${todoCount} TODO/FIXME markers`);
  }

  const debugCount = diffSummaries.reduce(
    (sum, d) =>
      sum + d.addedLines.filter((l) => /console\.log/i.test(l)).length,
    0
  );
  if (debugCount > 0) {
    score -= debugCount * 3;
    reasons.push(`${debugCount} debug statements`);
  }

  const totalChanges = diffSummaries.reduce(
    (sum, d) => sum + d.added + d.removed,
    0
  );
  if (totalChanges > 500) {
    score -= 15;
    reasons.push("very large uncommitted diff");
  } else if (totalChanges > 200) {
    score -= 8;
    reasons.push("large uncommitted diff");
  }

  const maxSaves = Math.max(...Object.values(session.saveCounts), 0);
  if (maxSaves >= 8) {
    score -= 10;
    reasons.push(`high iteration (${maxSaves} saves on one file)`);
  }

  const createdSet = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "create")
      .map((e) => e.file)
  );
  const deletedSet = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "delete")
      .map((e) => e.file)
  );
  if ([...createdSet].some((f) => deletedSet.has(f))) {
    score -= 10;
    reasons.push("files created and deleted");
  }

  if (todoCount === 0 && debugCount === 0) {
    score += 15;
  }
  if (totalChanges > 0 && totalChanges <= 100) {
    score += 10;
  }

  const level: ConfidenceLevel =
    score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";
  const explanation =
    reasons.length > 0
      ? reasons.join("; ") + "."
      : "Clean session with no unfinished signals.";

  return { level, explanation };
}

function detectWorkIntent(session: SessionData): {
  intent: WorkIntent;
  description: string;
} {
  const events = session.fileChangeEvents;
  const saveCounts = session.saveCounts;
  const files = session.filesTouched;

  if (files.length === 0) {
    return { intent: "mixed", description: "Minimal activity detected." };
  }

  const totalSaves = Object.values(saveCounts).reduce((a, b) => a + b, 0);
  const maxSavesOnSingleFile = Math.max(...Object.values(saveCounts), 0);
  const filesWithMultipleSaves = Object.values(saveCounts).filter(
    (c) => c > 2
  ).length;

  const categories = groupFilesByCategory(files);
  const hasUI = categories.UI.length > 0;
  const hasLogic = categories.Logic.length > 0;

  const createEvents = events.filter((e) => e.eventType === "create").length;
  const deleteEvents = events.filter((e) => e.eventType === "delete").length;

  const timestamps = events.map((e) => Date.parse(e.timestamp)).sort();
  let maxGapMinutes = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = (timestamps[i] - timestamps[i - 1]) / 60000;
    if (gap > maxGapMinutes) {
      maxGapMinutes = gap;
    }
  }

  if (files.length === 1 && totalSaves >= 3) {
    return {
      intent: "focused-deep-work",
      description: `Deep focus on a single file (${files[0]}) with ${totalSaves} saves.`,
    };
  }

  if (maxSavesOnSingleFile >= 5 && filesWithMultipleSaves <= 2) {
    const dominant = Object.entries(saveCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];
    return {
      intent: "active-iteration",
      description: `Iterating heavily on ${dominant[0]} (${dominant[1]} saves).`,
    };
  }

  if (hasUI && hasLogic) {
    return {
      intent: "ui-behavior-work",
      description:
        "Working across UI components and logic, likely building interactive behavior.",
    };
  }

  if (createEvents >= 3 || deleteEvents >= 2) {
    return {
      intent: "experimentation",
      description: `Experimentation phase with ${createEvents} files created and ${deleteEvents} deleted.`,
    };
  }

  if (maxGapMinutes > 10) {
    return {
      intent: "debugging-thinking",
      description: `Session had ${Math.round(maxGapMinutes)} minute gaps, suggesting debugging or deep thinking.`,
    };
  }

  if (files.length >= 5 && filesWithMultipleSaves <= 1) {
    return {
      intent: "exploration",
      description: `Explored ${files.length} files without deep iteration on any single one.`,
    };
  }

  return {
    intent: "mixed",
    description: `Mixed activity across ${files.length} files with ${totalSaves} total saves.`,
  };
}

function rankFilesByImportance(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): { file: string; reason: string }[] {
  const scores = new Map<string, { score: number; reasons: string[] }>();

  Object.entries(session.saveCounts).forEach(([file, count]) => {
    const entry = scores.get(file) || { score: 0, reasons: [] };
    entry.score += count * 10;
    if (count >= 3) {
      entry.reasons.push(`saved ${count} times`);
    }
    scores.set(file, entry);
  });

  diffSummaries.forEach((d) => {
    const entry = scores.get(d.file) || { score: 0, reasons: [] };
    const diffSize = d.added + d.removed;
    entry.score += diffSize;
    if (diffSize >= 20) {
      entry.reasons.push(`${d.added} lines added, ${d.removed} removed`);
    }
    scores.set(d.file, entry);
  });

  session.filesTouched.forEach((file) => {
    const cat = classifyFile(file);
    const entry = scores.get(file) || { score: 0, reasons: [] };
    if (cat === "UI" || cat === "Logic") {
      entry.score += 5;
    }
    scores.set(file, entry);
  });

  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .map(([file, data]) => ({
      file,
      reason: data.reasons.length > 0 ? data.reasons.join("; ") : "touched",
    }));
}

const FUNCTION_PATTERNS = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/,
  /^\s*def\s+(\w+)\s*\(/,
  /^\s*func\s+(\w+)\s*\(/,
];

const IMPORT_PATTERNS = [
  /^\s*import\s+/,
  /=\s*require\s*\(/,
  /^\s*from\s+/,
];

export function summarizeCodeChanges(delta: SessionDelta): CodeChangeSummary[] {
  const summaries: CodeChangeSummary[] = [];

  const allFiles = [
    ...delta.created.map((f) => ({
      file: f.file,
      addedLines: f.content,
      linesAdded: f.content.length,
      linesRemoved: 0,
    })),
    ...delta.updated.map((f) => ({
      file: f.file,
      addedLines: f.addedLines,
      linesAdded: f.added,
      linesRemoved: f.removed,
    })),
  ];

  for (const entry of allFiles) {
    const functionsAdded: string[] = [];
    let importsChanged = false;

    for (const line of entry.addedLines) {
      for (const pat of FUNCTION_PATTERNS) {
        const match = pat.exec(line);
        if (match && match[1] && !functionsAdded.includes(match[1])) {
          functionsAdded.push(match[1]);
          break;
        }
      }
      if (!importsChanged) {
        for (const pat of IMPORT_PATTERNS) {
          if (pat.test(line)) {
            importsChanged = true;
            break;
          }
        }
      }
    }

    summaries.push({
      file: entry.file,
      linesAdded: entry.linesAdded,
      linesRemoved: entry.linesRemoved,
      functionsAdded,
      importsChanged,
    });
  }

  return summaries;
}
