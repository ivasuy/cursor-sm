// ---------------------------------------------------------------------------
// macOS Keychain reader for Claude Code OAuth access token
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { claudeCredentialsPath } from './paths.js';

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = 'Claude Code-credentials';

interface ClaudeCredentials {
  accessToken?: string;
  refreshToken?: string;
  [key: string]: unknown;
}

/**
 * Attempt to read the Claude Code OAuth access token from macOS Keychain.
 * Returns null if not on macOS, the entry doesn't exist, or parsing fails.
 */
async function readFromKeychain(): Promise<string | null> {
  if (process.platform !== 'darwin') return null;

  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-w',
    ]);

    const raw = stdout.trim();
    if (!raw) return null;

    const parsed: ClaudeCredentials = JSON.parse(raw);
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Attempt to read the Claude Code OAuth access token from the fallback
 * credentials file at ~/.claude/.credentials.json.
 */
async function readFromCredentialsFile(): Promise<string | null> {
  try {
    const filePath = claudeCredentialsPath();
    const raw = await readFile(filePath, 'utf8');
    const parsed: ClaudeCredentials = JSON.parse(raw);
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the Claude Code OAuth access token.
 *
 * Strategy:
 * 1. On macOS, try the Keychain entry "Claude Code-credentials".
 * 2. Fall back to reading ~/.claude/.credentials.json.
 * 3. Return null if neither source yields a token.
 */
export async function getClaudeOAuthToken(): Promise<string | null> {
  const keychainToken = await readFromKeychain();
  if (keychainToken) return keychainToken;

  return readFromCredentialsFile();
}
