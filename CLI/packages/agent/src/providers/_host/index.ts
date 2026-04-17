import type { HostAPIs } from '../_shared/types.js';
import { createConsoleLogger } from './logger.js';
import { createHttpHost } from './http.js';
import { createPtyHost } from './pty.js';
import { createKeychainHost } from './keychain.js';
import { createBrowserCookiesHost } from './browser-cookies.js';
import { createTokenCostHost } from './token-cost.js';
import { createStatusHost } from './status.js';
import { createProcessSamplerHost } from './process-sampler.js';
import { createPlaywrightHost } from './playwright.js';

export function createHostAPIs(scope = 'worktrace'): HostAPIs {
  return {
    http: createHttpHost(),
    pty: createPtyHost(),
    keychain: createKeychainHost(),
    browserCookies: createBrowserCookiesHost(),
    tokenCost: createTokenCostHost(),
    status: createStatusHost(),
    processSampler: createProcessSamplerHost(),
    playwright: createPlaywrightHost(),
    logger: createConsoleLogger(scope),
  };
}
