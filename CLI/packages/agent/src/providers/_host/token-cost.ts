import { lookupModelCost } from './token-cost-models.js';

export interface TokenCostInput {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TokenCostHost {
  estimate(input: TokenCostInput): number;
}

export function createTokenCostHost(): TokenCostHost {
  return {
    estimate(input: TokenCostInput): number {
      const entry = lookupModelCost(input.provider, input.model);
      if (!entry) return 0;
      const inputCost = (input.inputTokens / 1000) * entry.inputPer1K;
      const outputCost = (input.outputTokens / 1000) * entry.outputPer1K;
      return inputCost + outputCost;
    },
  };
}
