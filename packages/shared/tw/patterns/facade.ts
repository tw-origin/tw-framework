/**
 * Facade -- simplified interface to complex subsystem
 * @module shared/patterns
 */

export class Facade<TSubsystems extends Record<string, unknown>> {
  constructor(private subsystems: TSubsystems) {}
  getSubsystem<K extends keyof TSubsystems>(name: K): TSubsystems[K] {
    return this.subsystems[name];
  }
  hasSubsystem(name: keyof TSubsystems): boolean {
    return name in this.subsystems;
  }
  getSubsystemNames(): string[] {
    return Object.keys(this.subsystems);
  }
  count(): number {
    return Object.keys(this.subsystems).length;
  }
  execute<K extends keyof TSubsystems>(name: K, action: (subsystem: TSubsystems[K]) => void): void {
    action(this.subsystems[name]);
  }
  executeAll(action: (subsystem: unknown) => void): void {
    for (const subsystem of Object.values(this.subsystems)) {
      action(subsystem);
    }
  }
  toJSON(): string {
    return JSON.stringify({ subsystems: Object.keys(this.subsystems) }, null, 2);
  }
}

export function createFacade<T extends Record<string, unknown>>(subsystems: T): Facade<T> {
  return new Facade(subsystems);
}

