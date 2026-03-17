import * as vscode from "vscode";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { DiffFileSummary } from "./types";
import { isExcludedFile } from "./constants";

const execFileAsync = promisify(execFile);

export async function getGitDiff(): Promise<string | null> {
  const cwd = getGitDiffCwd();
  if (!cwd) {
    return null;
  }
  try {
    // Get both staged/unstaged changes AND untracked new files
    const { stdout: trackedDiff } = await execFileAsync(
      "git",
      ["diff", "HEAD"],
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );

    // Also get diffs for untracked files (new files not yet added to git)
    let untrackedDiff = "";
    try {
      const { stdout: untrackedFiles } = await execFileAsync(
        "git",
        ["ls-files", "--others", "--exclude-standard"],
        { cwd, maxBuffer: 5 * 1024 * 1024 }
      );
      const newFiles = untrackedFiles
        .trim()
        .split("\n")
        .filter((f) => f && !isExcludedFile(f));

      // Generate a pseudo-diff for untracked files so they appear in the summary
      for (const file of newFiles.slice(0, 50)) {
        try {
          const { stdout: content } = await execFileAsync(
            "git",
            ["diff", "--no-index", "/dev/null", file],
            { cwd, maxBuffer: 2 * 1024 * 1024 }
          );
          untrackedDiff += content;
        } catch (err: unknown) {
          // git diff --no-index exits with code 1 when files differ (which they always will)
          const error = err as { stdout?: string };
          if (error.stdout) {
            untrackedDiff += error.stdout;
          }
        }
      }
    } catch {
      // Untracked file listing failed — not critical
    }

    const combined = (trackedDiff + "\n" + untrackedDiff).trim();
    return combined || "";
  } catch {
    return null;
  }
}

export async function getCurrentBranch(): Promise<string | null> {
  const cwd = getGitDiffCwd();
  if (!cwd) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function parseGitDiffByFile(gitDiff: string | null): DiffFileSummary[] {
  if (!gitDiff || !gitDiff.trim()) {
    return [];
  }
  const fileStats = new Map<string, DiffFileSummary>();
  const diffLines = gitDiff.split("\n");
  let currentFile = "";
  const maxSampleLines = 60;

  diffLines.forEach((line) => {
    if (line.startsWith("diff --git")) {
      const match = /diff --git a\/(.+?) b\/(.+)/.exec(line);
      currentFile = match ? match[2] : "";
      if (currentFile && !fileStats.has(currentFile)) {
        fileStats.set(currentFile, {
          file: currentFile,
          added: 0,
          removed: 0,
          addedLines: [],
          removedLines: [],
        });
      }
      return;
    }
    if (!currentFile || line.startsWith("+++ ") || line.startsWith("--- ")) {
      return;
    }
    const stats = fileStats.get(currentFile);
    if (!stats) {
      return;
    }
    if (line.startsWith("+")) {
      stats.added += 1;
      if (stats.addedLines.length < maxSampleLines) {
        stats.addedLines.push(line.slice(1));
      }
    } else if (line.startsWith("-")) {
      stats.removed += 1;
      if (stats.removedLines.length < maxSampleLines) {
        stats.removedLines.push(line.slice(1));
      }
    }
  });

  return Array.from(fileStats.values()).filter((s) => !isExcludedFile(s.file));
}

function getGitDiffCwd(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  if (vscode.workspace.workspaceFile) {
    return path.dirname(vscode.workspace.workspaceFile.fsPath);
  }
  return null;
}
