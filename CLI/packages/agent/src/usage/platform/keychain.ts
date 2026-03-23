// ---------------------------------------------------------------------------
// macOS Keychain reader for Claude Code OAuth access token
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { claudeCredentialsPath } from './paths.js';

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = 'Claude Code-credentials';

/** Shape of the Keychain / credentials file JSON. */
interface ClaudeCredentialsFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
  // Legacy flat format (just in case)
  accessToken?: string;
}

export interface ClaudeOAuthInfo {
  accessToken: string;
  subscriptionType: string | null;
  rateLimitTier: string | null;
}

/**
 * Parse the Claude credentials JSON and extract the OAuth info.
 * Handles both the nested `claudeAiOauth` format and legacy flat format.
 */
function parseCredentials(raw: string): ClaudeOAuthInfo | null {
  try {
    const parsed: ClaudeCredentialsFile = JSON.parse(raw);

    // Nested format (current Claude Code)
    if (parsed.claudeAiOauth?.accessToken) {
      return {
        accessToken: parsed.claudeAiOauth.accessToken,
        subscriptionType: parsed.claudeAiOauth.subscriptionType ?? null,
        rateLimitTier: parsed.claudeAiOauth.rateLimitTier ?? null,
      };
    }

    // Legacy flat format
    if (parsed.accessToken) {
      return {
        accessToken: parsed.accessToken,
        subscriptionType: null,
        rateLimitTier: null,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Read from macOS Keychain (primary source).
 */
async function readFromKeychain(): Promise<ClaudeOAuthInfo | null> {
  if (process.platform !== 'darwin') return null;

  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-w',
    ]);

    const raw = stdout.trim();
    if (!raw) return null;
    return parseCredentials(raw);
  } catch {
    return null;
  }
}

/**
 * Read from the credentials file at ~/.claude/.credentials.json (fallback).
 */
async function readFromCredentialsFile(): Promise<ClaudeOAuthInfo | null> {
  try {
    const filePath = claudeCredentialsPath();
    const raw = await readFile(filePath, 'utf8');
    return parseCredentials(raw);
  } catch {
    return null;
  }
}

/**
 * Get the Claude Code OAuth token and metadata.
 *
 * Strategy:
 * 1. On macOS, try the Keychain entry "Claude Code-credentials".
 * 2. Fall back to reading ~/.claude/.credentials.json.
 * 3. Return null if neither source yields a token.
 */
export async function getClaudeOAuthInfo(): Promise<ClaudeOAuthInfo | null> {
  const keychainInfo = await readFromKeychain();
  if (keychainInfo) return keychainInfo;

  return readFromCredentialsFile();
}

/**
 * Get just the OAuth access token (convenience wrapper).
 */
export async function getClaudeOAuthToken(): Promise<string | null> {
  const info = await getClaudeOAuthInfo();
  return info?.accessToken ?? null;
}
