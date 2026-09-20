/**
 * Strategy -- interchangeable algorithms
 * @module shared/patterns
 */

export class StrategyContext<TInput, TOutput> {
  private strategies: Map<string, (input: TInput) => TOutput> = new Map();
  private currentStrategy: string | null = null;
  private fallbackStrategy: string | null = null;
  private stats = { totalExecutions: 0, executionsByStrategy: new Map<string, number>() };

  register(name: string, strategy: (input: TInput) => TOutput): this {
    this.strategies.set(name, strategy);
    if (this.currentStrategy === null) {
      this.currentStrategy = name;
    }
    return this;
  }

  unregister(name: string): this {
    this.strategies.delete(name);
    if (this.currentStrategy === name) {
      this.currentStrategy = this.strategies.keys().next().value ?? null;
    }
    if (this.fallbackStrategy === name) {
      this.fallbackStrategy = null;
    }
    return this;
  }

  setStrategy(name: string): this {
    if (!this.strategies.has(name)) throw new Error(`Strategy "${name}" not found`);
    this.currentStrategy = name;
    return this;
  }

  setFallback(name: string): this {
    if (!this.strategies.has(name)) throw new Error(`Strategy "${name}" not found`);
    this.fallbackStrategy = name;
    return this;
  }

  execute(input: TInput): TOutput {
    this.stats.totalExecutions++;
    const strategyName = this.currentStrategy ?? this.fallbackStrategy;
    if (!strategyName) throw new Error("No strategy set");
    const strategy = this.strategies.get(strategyName);
    if (!strategy) throw new Error(`Strategy "${strategyName}" not found`);
    this.stats.executionsByStrategy.set(strategyName, (this.stats.executionsByStrategy.get(strategyName) ?? 0) + 1);
    return strategy(input);
  }

  executeWith(name: string, input: TInput): TOutput {
    if (!this.strategies.has(name)) throw new Error(`Strategy "${name}" not found`);
    this.stats.totalExecutions++;
    this.stats.executionsByStrategy.set(name, (this.stats.executionsByStrategy.get(name) ?? 0) + 1);
    return this.strategies.get(name)!(input);
  }

  getCurrentStrategy(): string | null {
    return this.currentStrategy;
  }

  getFallbackStrategy(): string | null {
    return this.fallbackStrategy;
  }

  hasStrategy(name: string): boolean {
    return this.strategies.has(name);
  }

  getStrategies(): string[] {
    return [...this.strategies.keys()];
  }

  count(): number {
    return this.strategies.size;
  }

  clear(): this {
    this.strategies.clear();
    this.currentStrategy = null;
    this.fallbackStrategy = null;
    this.stats = { totalExecutions: 0, executionsByStrategy: new Map() };
    return this;
  }

  getStats(): { totalExecutions: number; currentStrategy: string | null; strategyCount: number; executionsByStrategy: Record<string, number> } {
    return {
      totalExecutions: this.stats.totalExecutions,
      currentStrategy: this.currentStrategy,
      strategyCount: this.strategies.size,
      executionsByStrategy: Object.fromEntries(this.stats.executionsByStrategy),
    };
  }

  resetStats(): void {
    this.stats = { totalExecutions: 0, executionsByStrategy: new Map() };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createStrategyContext<TInput, TOutput>(): StrategyContext<TInput, TOutput> {
  return new StrategyContext();
}

