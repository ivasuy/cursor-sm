import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FileCategory } from './types.js';
import {
  isExcludedFile,
  MAX_FILE_CONTENT_LENGTH,
  MAX_AFFECTED_CONTENT_LENGTH,
  MAX_AFFECTED_FILES,
} from './constants.js';

const execFileAsync = promisify(execFile);

export function classifyFile(file: string): FileCategory {
  const ext = path.extname(file).toLowerCase();
  const basename = path.basename(file).toLowerCase();

  if (
    /\.test\.|\.spec\.|__tests__/i.test(basename) ||
    /test|spec/i.test(path.dirname(file).split(path.sep).pop() || "")
  ) {
    return "Test";
  }

  if (ext === ".jsx" || ext === ".tsx") {
    return "UI";
  }
  if ([".css", ".scss", ".sass", ".less", ".html", ".svelte", ".vue"].includes(ext)) {
    return "UI";
  }
  if (basename.includes("component") || basename.includes("page")) {
    return "UI";
  }

  if (
    [".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".properties"].includes(ext)
  ) {
    return "Config";
  }
  if (ext === ".env" || basename.startsWith(".")) {
    return "Config";
  }

  if ([".md", ".txt", ".rst", ".adoc"].includes(ext)) {
    return "Docs";
  }

  if (
    [
      ".ts", ".js", ".mjs", ".cjs",
      ".py", ".go", ".rs", ".java", ".kt", ".rb",
      ".php", ".c", ".cpp", ".h", ".hpp",
      ".sol", ".move", ".cairo",
      ".swift", ".dart", ".scala",
    ].includes(ext)
  ) {
    return "Logic";
  }

  return "Other";
}

export function groupFilesByCategory(
  files: string[]
): Record<FileCategory, string[]> {
  const grouped: Record<FileCategory, string[]> = {
    Logic: [],
    UI: [],
    Config: [],
    Docs: [],
    Test: [],
    Other: [],
  };
  files.forEach((file) => {
    grouped[classifyFile(file)].push(file);
  });
  return grouped;
}

export async function readFileContent(
  workspacePath: string,
  relativePath: string
): Promise<string> {
  try {
    const content = await readFile(path.join(workspacePath, relativePath), 'utf-8');
    return content.length > MAX_FILE_CONTENT_LENGTH
      ? content.slice(0, MAX_FILE_CONTENT_LENGTH) + "\n... (truncated)"
      : content;
  } catch {
    return "";
  }
}

export async function findAffectedFiles(
  workspacePath: string,
  deletedFile: string
): Promise<{ file: string; content: string }[]> {
  const stem = path.basename(deletedFile, path.extname(deletedFile));
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["grep", "-l", stem, "--", "*.ts", "*.js", "*.tsx", "*.jsx", "*.py", "*.go", "*.java", "*.rs", "*.rb", "*.php", "*.vue", "*.svelte", "*.sol"],
      { cwd: workspacePath, maxBuffer: 5 * 1024 * 1024 }
    );
    const files = stdout
      .trim()
      .split("\n")
      .filter((f) => f && f !== deletedFile && !isExcludedFile(f));

    const results: { file: string; content: string }[] = [];
    for (const file of files.slice(0, MAX_AFFECTED_FILES)) {
      const content = await readFileContent(workspacePath, file);
      if (content) {
        results.push({
          file,
          content:
            content.length > MAX_AFFECTED_CONTENT_LENGTH
              ? content.slice(0, MAX_AFFECTED_CONTENT_LENGTH) + "\n... (truncated)"
              : content,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}
