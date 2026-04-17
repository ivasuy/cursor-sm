import { registerModelCost } from '../_host/token-cost-models.js';

export const CODEX_MODELS = [
  { id: 'codex-mini-latest',   inputPer1K: 1.5,  outputPer1K: 6.0  },
  { id: 'codex',               inputPer1K: 3.0,  outputPer1K: 12.0 },
  { id: 'gpt-5-codex',         inputPer1K: 3.0,  outputPer1K: 12.0 },
  { id: 'gpt-5.3-codex',       inputPer1K: 3.0,  outputPer1K: 12.0 },
  { id: 'gpt-5-codex-mini',    inputPer1K: 1.5,  outputPer1K: 6.0  },
  { id: 'gpt-5.4',             inputPer1K: 15.0, outputPer1K: 60.0 },
  { id: 'gpt-4o',              inputPer1K: 2.5,  outputPer1K: 10.0 },
  { id: 'gpt-4o-mini',         inputPer1K: 0.15, outputPer1K: 0.6  },
  { id: 'o3',                  inputPer1K: 10.0, outputPer1K: 40.0 },
  { id: 'o4-mini',             inputPer1K: 1.1,  outputPer1K: 4.4  },
  { id: 'o3-mini',             inputPer1K: 1.1,  outputPer1K: 4.4  },
] as const;

for (const model of CODEX_MODELS) {
  registerModelCost('codex', model.id, {
    inputPer1K: model.inputPer1K,
    outputPer1K: model.outputPer1K,
  });
}
