export interface ModelCost {
  inputPer1K: number;
  outputPer1K: number;
}

const table = new Map<string, ModelCost>();

function key(provider: string, model: string): string {
  return `${provider.toLowerCase()}::${model.toLowerCase()}`;
}

export function registerModelCost(provider: string, model: string, cost: ModelCost): void {
  table.set(key(provider, model), cost);
}

export function lookupModelCost(provider: string, model: string): ModelCost | undefined {
  return table.get(key(provider, model));
}

export function resetModelCostTable(): void {
  table.clear();
}
