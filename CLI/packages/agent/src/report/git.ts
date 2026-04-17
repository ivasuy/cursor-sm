import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

interface DiffFileSummary {
  file: string;
  added: number;
  removed: number;
  addedLines: string[];
  removedLines: string[];
}

const EXCLUDED_PATTERNS = [
  /^node_modules\//,
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^out\//,
  /^target\//,
  /^coverage\//,
  /^\.git\//,
  /^sessions\//,
  /^\.worktrace\//,
  /^\.env$/,
  /\.min\.js$/,
  /\.bundle\.js$/,
  /\.map$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^go\.sum$/,
  /^Cargo\.lock$/,
  /^\.gradle\//,
  /^__pycache__\//,
  /^\.venv\//,
  /^vendor\//,
  /^artifacts\//,
  /^\.hardhat\//,
  /^cache\//,
];

function isExcludedFile(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));
}

const execFileAsync = promisify(execFile);

const devNull = process.platform === 'win32' ? 'NUL' : '/dev/null';

export async function getGitDiff(workspacePath: string): Promise<string | null> {
  try {
    // Get both staged/unstaged changes AND untracked new files
    const { stdout: trackedDiff } = await execFileAsync(
      "git",
      ["diff", "HEAD"],
      { cwd: workspacePath, maxBuffer: 10 * 1024 * 1024 }
    );

    // Also get diffs for untracked files (new files not yet added to git)
    let untrackedDiff = "";
    try {
      const { stdout: untrackedFiles } = await execFileAsync(
        "git",
        ["ls-files", "--others", "--exclude-standard"],
        { cwd: workspacePath, maxBuffer: 5 * 1024 * 1024 }
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
            ["diff", "--no-index", devNull, file],
            { cwd: workspacePath, maxBuffer: 2 * 1024 * 1024 }
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

export async function getCurrentBranch(workspacePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd: workspacePath });
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

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
}

export function parseWorktreeList(output: string): WorktreeInfo[] {
  const blocks = output.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n');
    let path = '';
    let head = '';
    let branch: string | null = null;
    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim();
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).trim();
      else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        branch = ref.replace(/^refs\/heads\//, '');
      } else if (line === 'detached') branch = null;
    }
    return { path, head, branch };
  }).filter((w) => w.path);
}

export async function listWorktrees(repoRoot: string): Promise<WorktreeInfo[]> {
  const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
  });
  return parseWorktreeList(stdout);
}

export async function currentBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
    return stdout.trim() || 'HEAD';
  } catch {
    return 'HEAD';
  }
}
