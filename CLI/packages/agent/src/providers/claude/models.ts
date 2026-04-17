import { registerModelCost } from '../_host/token-cost-models.js';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-4-6', inputPer1K: 15, outputPer1K: 75 },
  { id: 'claude-sonnet-4-6', inputPer1K: 3, outputPer1K: 15 },
  { id: 'claude-haiku-4-5', inputPer1K: 0.8, outputPer1K: 4 },
  { id: 'claude-3-5-sonnet', inputPer1K: 3, outputPer1K: 15 },
  { id: 'claude-3-5-haiku', inputPer1K: 0.8, outputPer1K: 4 },
  { id: 'claude-3-opus', inputPer1K: 15, outputPer1K: 75 },
] as const;

for (const model of CLAUDE_MODELS) {
  registerModelCost('claude', model.id, {
    inputPer1K: model.inputPer1K,
    outputPer1K: model.outputPer1K,
  });
}
