/**
 * State -- behavior changes with internal state
 * @module shared/patterns
 */

export class StateMachine<TState extends string = string> {
  private current: TState;
  private transitions: Map<string, Map<string, TState>> = new Map();
  private handlers: Map<TState, () => void> = new Map();
  private history: Array<{ from: TState; to: TState; timestamp: number }> = [];
  private maxHistory: number = 100;
  private stats = { totalTransitions: 0, transitionsByState: new Map<string, number>() };

  constructor(initial: TState) { this.current = initial; }

  addTransition(from: TState, event: string, to: TState): this {
    if (!this.transitions.has(from)) this.transitions.set(from, new Map());
    this.transitions.get(from)!.set(event, to);
    return this;
  }

  removeTransition(from: TState, event: string): this {
    this.transitions.get(from)?.delete(event);
    return this;
  }

  onEnter(state: TState, handler: () => void): this {
    this.handlers.set(state, handler);
    return this;
  }

  canTransition(event: string): boolean {
    return this.transitions.get(this.current)?.has(event) ?? false;
  }

  transition(event: string): boolean {
    const nextState = this.transitions.get(this.current)?.get(event);
    if (nextState === undefined) return false;
    const from = this.current;
    this.current = nextState;
    this.history.push({ from, to: nextState, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();
    this.stats.totalTransitions++;
    this.stats.transitionsByState.set(nextState, (this.stats.transitionsByState.get(nextState) ?? 0) + 1);
    this.handlers.get(nextState)?.();
    return true;
  }

  getCurrentState(): TState { return this.current; }
  getAvailableEvents(): string[] { return [...(this.transitions.get(this.current)?.keys() ?? [])]; }
  getAvailableTransitions(): Array<{ event: string; to: TState }> {
    const transitions = this.transitions.get(this.current);
    if (!transitions) return [];
    return [...transitions.entries()].map(([event, to]) => ({ event, to }));
  }
  getHistory(): Array<{ from: TState; to: TState; timestamp: number }> { return [...this.history]; }
  clearHistory(): void { this.history = []; }
  setMaxHistory(max: number): void { this.maxHistory = max; while (this.history.length > max) this.history.shift(); }
  getStats(): { totalTransitions: number; currentState: TState; transitionsByState: Record<string, number> } {
    return { totalTransitions: this.stats.totalTransitions, currentState: this.current, transitionsByState: Object.fromEntries(this.stats.transitionsByState) };
  }
  resetStats(): void { this.stats = { totalTransitions: 0, transitionsByState: new Map() }; }
  toJSON(): string { return JSON.stringify(this.getStats(), null, 2); }
}

export function createStateMachine<TState extends string>(initial: TState): StateMachine<TState> {
  return new StateMachine(initial);
}

