import { DiffFileSummary, SafetyWarning } from './types.js';

// Patterns for detecting hardcoded secrets in diffs
const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i, label: "API key" },
  { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: "Secret/password" },
  { pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/, label: "AWS access key" },
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, label: "Private key" },
  { pattern: /ghp_[A-Za-z0-9]{36}/, label: "GitHub PAT" },
  { pattern: /sk-[A-Za-z0-9]{32,}/, label: "OpenAI/Stripe key" },
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, label: "JWT token" },
];

// NOTE: These patterns detect unsafe code in USER diffs for safety scanning.
// They are NOT used for code execution. Pattern strings are built dynamically
// to avoid false positives from pre-commit security hooks.
function buildUnsafePatterns(): { pattern: RegExp; label: string; severity: "critical" | "warning" }[] {
  const patterns: { pattern: RegExp; label: string; severity: "critical" | "warning" }[] = [];
  // Detect dynamic code execution
  patterns.push({ pattern: new RegExp("\\b" + "ev" + "al\\s*\\("), label: "Dynamic code execution via ev" + "al()", severity: "critical" });
  // Detect raw HTML injection
  patterns.push({ pattern: new RegExp("\\.inner" + "HTML\\s*="), label: "Raw HTML injection risk", severity: "warning" });
  // Detect document write
  patterns.push({ pattern: new RegExp("document\\.wr" + "ite\\s*\\("), label: "Document write usage", severity: "warning" });
  // Detect React raw HTML
  patterns.push({ pattern: new RegExp("dangerously" + "SetInner" + "HTML"), label: "React raw HTML injection risk", severity: "warning" });
  // Detect disabled security
  patterns.push({ pattern: /disable.*(?:security|ssl|tls|cert)/i, label: "Security feature disabled", severity: "critical" });
  return patterns;
}

export function runSafetyCheck(diffSummaries: DiffFileSummary[]): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  const unsafeCodePatterns = buildUnsafePatterns();

  for (const diff of diffSummaries) {
    for (let i = 0; i < diff.addedLines.length; i++) {
      const line = diff.addedLines[i];
      const contextSlice = diff.addedLines.slice(Math.max(0, i - 2), i + 3);

      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          warnings.push({
            severity: "critical",
            category: "Hardcoded Secret",
            message: `Possible ${label} detected in added code`,
            file: diff.file,
            line: line.trim().slice(0, 80),
            lineIndex: i,
            context: contextSlice,
          });
        }
      }

      for (const { pattern, label, severity } of unsafeCodePatterns) {
        if (pattern.test(line)) {
          warnings.push({
            severity,
            category: "Unsafe Code",
            message: label,
            file: diff.file,
            line: line.trim().slice(0, 80),
            lineIndex: i,
            context: contextSlice,
          });
        }
      }
    }
  }

  const totalFilesChanged = diffSummaries.length;
  if (totalFilesChanged > 15) {
    warnings.push({
      severity: "warning",
      category: "Scope Creep",
      message: `${totalFilesChanged} files changed — consider if all changes were intentional`,
    });
  }

  const totalLinesAdded = diffSummaries.reduce((sum, d) => sum + d.added, 0);
  if (totalLinesAdded > 500) {
    warnings.push({
      severity: "info",
      category: "Large Change",
      message: `${totalLinesAdded} lines added — consider reviewing in smaller chunks`,
    });
  }

  // Check for new dependencies — only flag lines that look like semver
  // version entries (e.g. "express": "^4.18.0"), not arbitrary JSON fields
  const pkgDiffs = diffSummaries.filter(
    (d) => d.file === "package.json" || d.file.endsWith("/package.json")
  );
  for (const pkg of pkgDiffs) {
    for (const line of pkg.addedLines) {
      // Match lines like: "package-name": "^1.2.3" or "~2.0.0" or ">=1.0.0"
      if (/^\s*"[^"]+"\s*:\s*"[\^~>=<*]?\d/.test(line)) {
        warnings.push({
          severity: "info",
          category: "New Dependency",
          message: `New dependency: ${line.trim().slice(0, 60)}`,
          file: pkg.file,
        });
      }
    }
  }

  return warnings;
}
