import type { ProviderDescriptor } from '../_shared/types.js';
import { linearPipeline } from '../_shared/fetch-strategy.js';
import { cookiesHttp, localLogScan, apiKeyHttp, cliPty } from './strategies.js';
import './models.js';

export const claudeDescriptor: ProviderDescriptor = {
  id: 'claude',
  metadata: {
    displayName: 'Claude Code',
    vendor: 'Anthropic',
    category: 'cli',
    website: 'https://www.anthropic.com',
  },
  branding: { icon: '🟧', accentColor: '#C86A3B' },
  capabilities: {
    quotaBar: true, tokenBreakdown: true, costTracking: true,
    creditsBalance: false, sessionUsage: true, modelSelection: true,
  },
  fetchPlan: {
    pipeline: linearPipeline([cookiesHttp, apiKeyHttp, localLogScan, cliPty]),
    sampleIntervalMs: 60_000,
    cacheMaxAgeMs: 60_000,
  },
  cli: { listLabel: 'Claude Code', detailSections: ['session', 'weekly', 'tokens', 'cost'] },
};

export default claudeDescriptor;
