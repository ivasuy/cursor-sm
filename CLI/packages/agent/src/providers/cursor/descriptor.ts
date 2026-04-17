import type { ProviderDescriptor } from '../_shared/types.js';
import { linearPipeline } from '../_shared/fetch-strategy.js';
import { cookiesHttp, localConfigScan } from './strategies.js';
import './models.js';

export const cursorDescriptor: ProviderDescriptor = {
  id: 'cursor',
  metadata: {
    displayName: 'Cursor',
    vendor: 'Anysphere',
    category: 'ide',
    website: 'https://cursor.com',
  },
  branding: { icon: '🟪', accentColor: '#8B5CF6' },
  capabilities: {
    quotaBar: true, tokenBreakdown: true, costTracking: true,
    creditsBalance: false, sessionUsage: true, modelSelection: true,
  },
  fetchPlan: {
    pipeline: linearPipeline([cookiesHttp, localConfigScan]),
    sampleIntervalMs: 60_000,
    cacheMaxAgeMs: 60_000,
  },
  cli: { listLabel: 'Cursor', detailSections: ['weekly', 'tokens', 'cost'] },
};

export default cursorDescriptor;
