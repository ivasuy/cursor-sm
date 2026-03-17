import { SessionData, DiffFileSummary, SessionDelta } from "./types";
import { readFileContent, findAffectedFiles } from "./file-utils";

export async function buildSessionDelta(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): Promise<SessionDelta> {
  const createEvents = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "create")
      .map((e) => e.file)
  );
  const deleteEvents = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "delete")
      .map((e) => e.file)
  );

  const diffByFile = new Map(diffSummaries.map((d) => [d.file, d]));
  const deletedFileNames = Array.from(deleteEvents).filter(
    (f) => !createEvents.has(f)
  );

  const created: SessionDelta["created"] = [];
  const updated: SessionDelta["updated"] = [];

  for (const [file, diff] of diffByFile) {
    if (deleteEvents.has(file)) {
      continue;
    }
    if (createEvents.has(file)) {
      const fullContent = await readFileContent(session.workspacePath, file);
      created.push({ file, content: diff.addedLines, fullContent });
    } else {
      const fullContent = await readFileContent(session.workspacePath, file);
      updated.push({
        file,
        added: diff.added,
        removed: diff.removed,
        addedLines: diff.addedLines,
        removedLines: diff.removedLines,
        fullContent,
      });
    }
  }

  for (const file of createEvents) {
    if (!diffByFile.has(file) && !deleteEvents.has(file)) {
      const fullContent = await readFileContent(session.workspacePath, file);
      created.push({ file, content: [], fullContent });
    }
  }

  const deleted: SessionDelta["deleted"] = [];
  for (const file of deletedFileNames) {
    const affectedFiles = await findAffectedFiles(
      session.workspacePath,
      file
    );
    deleted.push({ file, affectedFiles });
  }

  return { created, updated, deleted };
}
