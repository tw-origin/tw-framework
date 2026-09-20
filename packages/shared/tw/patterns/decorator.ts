/**
 * Decorator -- adds behavior dynamically
 * @module shared/patterns
 */

export interface Component {
  operation(): string;
}

export class BaseComponent implements Component {
  operation(): string { return "base"; }
}

export class Decorator implements Component {
  constructor(protected component: Component) {}
  operation(): string { return this.component.operation(); }
}

export class ComponentDecorator implements Component {
  private decorators: Array<(result: string) => string> = [];
  constructor(private component: Component) {}
  addDecorator(decorator: (result: string) => string): this {
    this.decorators.push(decorator);
    return this;
  }
  removeDecorator(decorator: (result: string) => string): this {
    this.decorators = this.decorators.filter((d) => d !== decorator);
    return this;
  }
  operation(): string {
    let result = this.component.operation();
    for (const decorator of this.decorators) {
      result = decorator(result);
    }
    return result;
  }
  getDecoratorCount(): number { return this.decorators.length; }
  clearDecorators(): this { this.decorators = []; return this; }
}

export function createComponentDecorator(component: Component): ComponentDecorator {
  return new ComponentDecorator(component);
}

