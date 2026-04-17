import type { ProviderDescriptor } from '../_shared/types.js';
import { linearPipeline } from '../_shared/fetch-strategy.js';
import { oauthHttp, localStateScan, cliPty, localConfigScan } from './strategies.js';
import './models.js';

export const codexDescriptor: ProviderDescriptor = {
  id: 'codex',
  metadata: {
    displayName: 'Codex CLI',
    vendor: 'OpenAI',
    category: 'cli',
    website: 'https://openai.com',
  },
  branding: { icon: '⬛', accentColor: '#1F1F1F' },
  capabilities: {
    quotaBar: true, tokenBreakdown: true, costTracking: true,
    creditsBalance: false, sessionUsage: true, modelSelection: true,
  },
  fetchPlan: {
    pipeline: linearPipeline([oauthHttp, localStateScan, cliPty, localConfigScan]),
    sampleIntervalMs: 60_000,
    cacheMaxAgeMs: 60_000,
  },
  cli: { listLabel: 'Codex CLI', detailSections: ['session', 'weekly', 'tokens', 'cost'] },
};

export default codexDescriptor;
