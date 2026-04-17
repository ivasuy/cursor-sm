import type { ProviderId } from '../_shared/types.js';

export interface ProviderPattern {
  provider: ProviderId;
  regex: RegExp;
}

export const PROVIDER_PATTERNS: ProviderPattern[] = [
  { provider: 'claude', regex: /\bclaude(-code)?\b/ },
  { provider: 'codex', regex: /\b(codex|openai-codex)\b/ },
  { provider: 'cursor', regex: /\bcursor(-agent)?\b/ },
];

export function matchProvider(command: string): ProviderId | null {
  for (const pattern of PROVIDER_PATTERNS) {
    if (pattern.regex.test(command)) return pattern.provider;
  }
  return null;
}
