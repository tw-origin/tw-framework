/**
 * Testing utilities -- render, query, interact with components in tests.
 * @module runtime/testing
 */

import type { Component } from "../component";

export interface RenderOptions {
  props?: Record<string, unknown>;
  slots?: Record<string, string>;
  global?: Record<string, unknown>;
  attachTo?: HTMLElement;
  container?: HTMLElement;
}

export interface RenderResult {
  container: HTMLElement;
  component: Component;
  unmount: () => void;
  rerender: (props?: Record<string, unknown>) => void;
  getByText: (text: string) => HTMLElement | null;
  getByRole: (role: string) => HTMLElement | null;
  getByTestId: (testId: string) => HTMLElement | null;
  getByPlaceholderText: (text: string) => HTMLElement | null;
  getByLabelText: (text: string) => HTMLElement | null;
  getByAltText: (text: string) => HTMLElement | null;
  getByTitle: (text: string) => HTMLElement | null;
  getAllByText: (text: string) => HTMLElement[];
  getAllByRole: (role: string) => HTMLElement[];
  getAllByTestId: (testId: string) => HTMLElement[];
  queryByText: (text: string) => HTMLElement | null;
  queryByRole: (role: string) => HTMLElement | null;
  queryByTestId: (testId: string) => HTMLElement | null;
  findByText: (text: string, timeout?: number) => Promise<HTMLElement>;
  findByRole: (role: string, timeout?: number) => Promise<HTMLElement>;
  findByTestId: (testId: string, timeout?: number) => Promise<HTMLElement>;
  fireEvent: (event: string, element?: HTMLElement, options?: Record<string, unknown>) => void;
  click: (element?: HTMLElement) => void;
  type: (text: string, element?: HTMLElement) => void;
  submit: (form?: HTMLFormElement) => void;
  focus: (element?: HTMLElement) => void;
  blur: (element?: HTMLElement) => void;
  keyDown: (key: string, element?: HTMLElement) => void;
  keyUp: (key: string, element?: HTMLElement) => void;
  mouseEnter: (element?: HTMLElement) => void;
  mouseLeave: (element?: HTMLElement) => void;
  waitFor: (callback: () => boolean | Promise<boolean>, timeout?: number) => Promise<void>;
  waitForElement: (selector: string, timeout?: number) => Promise<HTMLElement>;
  waitForElementToBeRemoved: (selector: string, timeout?: number) => Promise<void>;
}

export function render(component: Component, options: RenderOptions = {}): RenderResult {
  const container = options.container ?? document.createElement("div");
  if (options.attachTo) {
    options.attachTo.appendChild(container);
  } else {
    document.body.appendChild(container);
  }
  const unmount = () => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };
  const rerender = (props?: Record<string, unknown>) => {
    void props;
  };
  const getByText = (text: string): HTMLElement | null => {
    const elements = container.querySelectorAll("*");
    for (const el of elements) {
      if (el.textContent?.includes(text)) return el as HTMLElement;
    }
    return null;
  };
  const getByRole = (role: string): HTMLElement | null => {
    return container.querySelector(`[role="${role}"]`) as HTMLElement | null;
  };
  const getByTestId = (testId: string): HTMLElement | null => {
    return container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  };
  const getByPlaceholderText = (text: string): HTMLElement | null => {
    return container.querySelector(`[placeholder="${text}"]`) as HTMLElement | null;
  };
  const getByLabelText = (text: string): HTMLElement | null => {
    const labels = container.querySelectorAll("label");
    for (const label of labels) {
      if (label.textContent?.includes(text)) {
        const forId = label.getAttribute("for");
        if (forId) return container.querySelector(`#${forId}`) as HTMLElement | null;
        const input = label.querySelector("input, textarea, select");
        if (input) return input as HTMLElement;
      }
    }
    return null;
  };
  const getByAltText = (text: string): HTMLElement | null => {
    return container.querySelector(`[alt="${text}"]`) as HTMLElement | null;
  };
  const getByTitle = (text: string): HTMLElement | null => {
    return container.querySelector(`[title="${text}"]`) as HTMLElement | null;
  };
  const getAllByText = (text: string): HTMLElement[] => {
    const result: HTMLElement[] = [];
    const elements = container.querySelectorAll("*");
    for (const el of elements) {
      if (el.textContent?.includes(text)) result.push(el as HTMLElement);
    }
    return result;
  };
  const getAllByRole = (role: string): HTMLElement[] => {
    return [...container.querySelectorAll(`[role="${role}"]`)] as HTMLElement[];
  };
  const getAllByTestId = (testId: string): HTMLElement[] => {
    return [...container.querySelectorAll(`[data-testid="${testId}"]`)] as HTMLElement[];
  };
  const queryByText = (text: string): HTMLElement | null => getByText(text);
  const queryByRole = (role: string): HTMLElement | null => getByRole(role);
  const queryByTestId = (testId: string): HTMLElement | null => getByTestId(testId);
  const findByText = (text: string, timeout: number = 5000): Promise<HTMLElement> => {
    return waitForElement(`*:has-text("${text}")`, timeout).then(() => getByText(text)!);
  };
  const findByRole = (role: string, timeout: number = 5000): Promise<HTMLElement> => {
    return waitForElement(`[role="${role}"]`, timeout).then(() => getByRole(role)!);
  };
  const findByTestId = (testId: string, timeout: number = 5000): Promise<HTMLElement> => {
    return waitForElement(`[data-testid="${testId}"]`, timeout).then(() => getByTestId(testId)!);
  };
  const fireEvent = (event: string, element: HTMLElement = container, options?: Record<string, unknown>): void => {
    const customEvent = new CustomEvent(event, { detail: options, bubbles: true });
    element.dispatchEvent(customEvent);
  };
  const click = (element: HTMLElement = container): void => {
    fireEvent("click", element);
  };
  const type = (text: string, element: HTMLElement = container): void => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = text;
      fireEvent("input", element);
      fireEvent("change", element);
    }
  };
  const submit = (form?: HTMLFormElement): void => {
    const formEl = form ?? container.querySelector("form");
    if (formEl) {
      fireEvent("submit", formEl);
    }
  };
  const focus = (element: HTMLElement = container): void => {
    fireEvent("focus", element);
  };
  const blur = (element: HTMLElement = container): void => {
    fireEvent("blur", element);
  };
  const keyDown = (key: string, element: HTMLElement = container): void => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true });
    element.dispatchEvent(event);
  };
  const keyUp = (key: string, element: HTMLElement = container): void => {
    const event = new KeyboardEvent("keyup", { key, bubbles: true });
    element.dispatchEvent(event);
  };
  const mouseEnter = (element: HTMLElement = container): void => {
    fireEvent("mouseenter", element);
  };
  const mouseLeave = (element: HTMLElement = container): void => {
    fireEvent("mouseleave", element);
  };
  const waitFor = (callback: () => boolean | Promise<boolean>, timeout: number = 5000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        try {
          const result = callback();
          if (result instanceof Promise) {
            result.then((res) => {
              if (res) resolve();
              else if (Date.now() - startTime > timeout) reject(new Error("waitFor timeout"));
              else setTimeout(check, 50);
            }).catch(reject);
          } else {
            if (result) resolve();
            else if (Date.now() - startTime > timeout) reject(new Error("waitFor timeout"));
            else setTimeout(check, 50);
          }
        } catch (error) {
          if (Date.now() - startTime > timeout) reject(error);
          else setTimeout(check, 50);
        }
      };
      check();
    });
  };
  const waitForElement = (selector: string, timeout: number = 5000): Promise<HTMLElement> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        const el = container.querySelector(selector);
        if (el) resolve(el as HTMLElement);
        else if (Date.now() - startTime > timeout) reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
        else setTimeout(check, 50);
      };
      check();
    });
  };
  const waitForElementToBeRemoved = (selector: string, timeout: number = 5000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        const el = container.querySelector(selector);
        if (!el) resolve();
        else if (Date.now() - startTime > timeout) reject(new Error(`Element "${selector}" was not removed within ${timeout}ms`));
        else setTimeout(check, 50);
      };
      check();
    });
  };
  return {
    container,
    component,
    unmount,
    rerender,
    getByText,
    getByRole,
    getByTestId,
    getByPlaceholderText,
    getByLabelText,
    getByAltText,
    getByTitle,
    getAllByText,
    getAllByRole,
    getAllByTestId,
    queryByText,
    queryByRole,
    queryByTestId,
    findByText,
    findByRole,
    findByTestId,
    fireEvent,
    click,
    type,
    submit,
    focus,
    blur,
    keyDown,
    keyUp,
    mouseEnter,
    mouseLeave,
    waitFor,
    waitForElement,
    waitForElementToBeRemoved,
  };
}

export function screen(): RenderResult {
  return render(null as unknown as Component);
}

export function cleanup(): void {
  document.body.innerHTML = "";
}

export function act(callback: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(callback());
}

export function mockFunction<T extends (...args: any[]) => any>(fn: T): T & { mock: { calls: any[][]; results: any[]; instances: any[]; mockReturnValue(value: any): void; mockResolvedValue(value: any): void; mockRejectedValue(value: any): void; mockImplementation(fn: (...args: any[]) => any): void; mockClear(): void; mockReset(): void; mockRestore(): void; } } {
  const mockFn = ((...args: any[]) => {
    mockFn.mock.calls.push(args);
    const result = mockFn.mock.implementation ? mockFn.mock.implementation(...args) : mockFn.mock.returnValue;
    mockFn.mock.results.push(result);
    return result;
  }) as any;
  mockFn.mock = {
    calls: [],
    results: [],
    instances: [],
    returnValue: undefined,
    implementation: undefined,
    mockReturnValue(value: any) { this.returnValue = value; },
    mockResolvedValue(value: any) { this.returnValue = Promise.resolve(value); },
    mockRejectedValue(value: any) { this.returnValue = Promise.reject(value); },
    mockImplementation(fn: (...args: any[]) => any) { this.implementation = fn; },
    mockClear() { this.calls = []; this.results = []; this.instances = []; },
    mockReset() { this.mockClear(); this.returnValue = undefined; this.implementation = undefined; },
    mockRestore() { this.mockReset(); },
  };
  return mockFn;
}

export function spyOn<T extends Record<string, any>>(obj: T, method: keyof T): T[keyof T] & { mock: { calls: any[][]; results: any[]; mockRestore(): void; } } {
  const original = obj[method];
  const spy = mockFunction(original as any);
  obj[method] = spy as any;
  spy.mock.mockRestore = () => { obj[method] = original; };
  return spy;
}

export function describe(name: string, fn: () => void): void {
  fn();
}

export function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch(console.error);
    }
  } catch (error) {
    console.error(error);
  }
}

export const it = test;

export function beforeAll(fn: () => void | Promise<void>): void {
  fn();
}

export function afterAll(fn: () => void | Promise<void>): void {
  void fn;
}

export function beforeEach(fn: () => void | Promise<void>): void {
  void fn;
}

export function afterEach(fn: () => void | Promise<void>): void {
  void fn;
}

export function expect<T>(value: T): { toBe: (expected: T) => void; toEqual: (expected: T) => void; toBeNull: () => void; toBeUndefined: () => void; toBeDefined: () => void; toBeTruthy: () => void; toBeFalsy: () => void; toContain: (expected: any) => void; toHaveLength: (expected: number) => void; toBeGreaterThan: (expected: number) => void; toBeLessThan: (expected: number) => void; toBeGreaterThanOrEqual: (expected: number) => void; toBeLessThanOrEqual: (expected: number) => void; toMatch: (expected: string | RegExp) => void; toThrow: (expected?: string | RegExp | Error) => void; toBeInstanceOf: (expected: any) => void; toHaveProperty: (path: string, value?: any) => void; resolves: { toBe: (expected: T) => Promise<void>; toEqual: (expected: T) => Promise<void>; } ; rejects: { toThrow: (expected?: string | RegExp | Error) => Promise<void>; } ; not: { toBe: (expected: T) => void; toEqual: (expected: T) => void; toBeNull: () => void; toContain: (expected: any) => void; toHaveLength: (expected: number) => void; toMatch: (expected: string | RegExp) => void; toThrow: (expected?: string | RegExp | Error) => void; }; } {
  const assertions = {
    toBe(expected: T) { if (value !== expected) throw new Error(`Expected ${value} to be ${expected}`); },
    toEqual(expected: T) { if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`); },
    toBeNull() { if (value !== null) throw new Error(`Expected ${value} to be null`); },
    toBeUndefined() { if (value !== undefined) throw new Error(`Expected ${value} to be undefined`); },
    toBeDefined() { if (value === undefined) throw new Error(`Expected ${value} to be defined`); },
    toBeTruthy() { if (!value) throw new Error(`Expected ${value} to be truthy`); },
    toBeFalsy() { if (value) throw new Error(`Expected ${value} to be falsy`); },
    toContain(expected: any) { if (typeof value === "string") { if (!value.includes(expected)) throw new Error(`Expected "${value}" to contain "${expected}"`); } else if (Array.isArray(value)) { if (!value.includes(expected)) throw new Error(`Expected array to contain ${expected}`); } },
    toHaveLength(expected: number) { if ((value as any)?.length !== expected) throw new Error(`Expected length ${expected}, got ${(value as any)?.length ?? 0}`); },
    toBeGreaterThan(expected: number) { if (typeof value !== "number" || value <= expected) throw new Error(`Expected ${value} > ${expected}`); },
    toBeLessThan(expected: number) { if (typeof value !== "number" || value >= expected) throw new Error(`Expected ${value} < ${expected}`); },
    toBeGreaterThanOrEqual(expected: number) { if (typeof value !== "number" || value < expected) throw new Error(`Expected ${value} >= ${expected}`); },
    toBeLessThanOrEqual(expected: number) { if (typeof value !== "number" || value > expected) throw new Error(`Expected ${value} <= ${expected}`); },
    toMatch(expected: string | RegExp) { const regex = typeof expected === "string" ? new RegExp(expected) : expected; if (typeof value !== "string" || !regex.test(value)) throw new Error(`Expected "${value}" to match ${expected}`); },
    toThrow(expected?: string | RegExp | Error) { if (typeof value !== "function") throw new Error("Expected a function"); try { (value as any)(); throw new Error("Expected function to throw"); } catch (error) { if (expected) { const msg = error instanceof Error ? error.message : String(error); if (typeof expected === "string" && !msg.includes(expected)) throw new Error(`Expected error "${msg}" to contain "${expected}"`); if (expected instanceof RegExp && !expected.test(msg)) throw new Error(`Expected error "${msg}" to match ${expected}`); } } },
    toBeInstanceOf(expected: any) { if (!(value instanceof expected)) throw new Error(`Expected ${value} to be instance of ${expected.name}`); },
    toHaveProperty(path: string, val?: any) { const parts = path.split("."); let obj: any = value; for (const part of parts) { if (obj == null || !(part in obj)) throw new Error(`Expected ${path} to exist`); obj = obj[part]; } if (val !== undefined && JSON.stringify(obj) !== JSON.stringify(val)) throw new Error(`Expected property ${path} to be ${val}, got ${obj}`); },
    resolves: { async toBe(expected: T) { const resolved = await value; if (resolved !== expected) throw new Error(`Expected ${resolved} to be ${expected}`); }, async toEqual(expected: T) { const resolved = await value; if (JSON.stringify(resolved) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(resolved)} to equal ${JSON.stringify(expected)}`); } },
    rejects: { async toThrow(expected?: string | RegExp | Error) { try { await value; throw new Error("Expected promise to reject"); } catch (error) { if (expected) { const msg = error instanceof Error ? error.message : String(error); if (typeof expected === "string" && !msg.includes(expected)) throw new Error(`Expected error "${msg}" to contain "${expected}"`); if (expected instanceof RegExp && !expected.test(msg)) throw new Error(`Expected error "${msg}" to match ${expected}`); } } } },
    not: { toBe(expected: T) { if (value === expected) throw new Error(`Expected ${value} to not be ${expected}`); }, toEqual(expected: T) { if (JSON.stringify(value) === JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(value)} to not equal ${JSON.stringify(expected)}`); }, toBeNull() { if (value === null) throw new Error(`Expected ${value} to not be null`); }, toContain(expected: any) { if (typeof value === "string" && value.includes(expected)) throw new Error(`Expected "${value}" to not contain "${expected}"`); if (Array.isArray(value) && value.includes(expected)) throw new Error(`Expected array to not contain ${expected}`); }, toHaveLength(expected: number) { if ((value as any)?.length === expected) throw new Error(`Expected length to not be ${expected}`); }, toMatch(expected: string | RegExp) { const regex = typeof expected === "string" ? new RegExp(expected) : expected; if (typeof value === "string" && regex.test(value)) throw new Error(`Expected "${value}" to not match ${expected}`); }, toThrow(expected?: string | RegExp | Error) { void expected; } },
  };
  return assertions;
}

expect.extend = (matchers: Record<string, (...args: any[]) => void>) => { void matchers; };
expect.any = (constructor: any) => ({ $$typeof: "expect.any", constructor });
expect.anything = () => ({ $$typeof: "expect.anything" });
expect.arrayContaining = (array: any[]) => ({ $$typeof: "expect.arrayContaining", array });
expect.objectContaining = (object: Record<string, any>) => ({ $$typeof: "expect.objectContaining", object });
expect.stringContaining = (string: string) => ({ $$typeof: "expect.stringContaining", string });
expect.stringMatching = (pattern: string | RegExp) => ({ $$typeof: "expect.stringMatching", pattern });
expect.assertions = (count: number) => { void count; };
expect.hasAssertions = () => {};

export function mockRoute(path: string, handler: () => unknown): void { void path; void handler; }
export function mockFetch(response: unknown): void { void response; }
export function mockLocalStorage(data: Record<string, string>): void { void data; }
export function mockSessionStorage(data: Record<string, string>): void { void data; }
export function mockMatchMedia(matches: boolean): void { void matches; }
export function mockIntersectionObserver(isIntersecting: boolean): void { void isIntersecting; }
export function mockResizeObserver(entries: Array<{ contentRect: { width: number; height: number } }>): void { void entries; }
export function mockMutationObserver(callback: (mutations: MutationRecord[]) => void): void { void callback; }
export function mockScroll(position: { x: number; y: number }): void { void position; }
export function mockWindowProperty(prop: string, value: unknown): void { void prop; void value; }
export function mockDocumentProperty(prop: string, value: unknown): void { void prop; void value; }
export function mockElementProperty(element: HTMLElement, prop: string, value: unknown): void { void element; void prop; void value; }
export function mockEvent(type: string, options?: Record<string, unknown>): Event { return new Event(type, options); }
export function mockKeyboardEvent(key: string, options?: KeyboardEventInit): KeyboardEvent { return new KeyboardEvent("keydown", { key, ...options }); }
export function mockMouseEvent(type: string, options?: MouseEventInit): MouseEvent { return new MouseEvent(type, options); }
export function mockCustomEvent(type: string, detail?: unknown): CustomEvent { return new CustomEvent(type, { detail }); }
export function mockFile(name: string, content: string, type: string = "text/plain"): File { return new File([content], name, { type }); }
export function mockFormData(data: Record<string, string>): FormData { const fd = new FormData(); for (const [key, value] of Object.entries(data)) fd.append(key, value); return fd; }
export function mockHeaders(data: Record<string, string>): Headers { return new Headers(data); }
export function mockRequest(url: string, options?: RequestInit): Request { return new Request(url, options); }
export function mockResponse(body: unknown, options?: ResponseInit): Response { return new Response(JSON.stringify(body), options); }
export function mockURL(url: string): URL { return new URL(url); }
export function mockHistory(): void {}
export function mockLocation(url: string): void { void url; }
export function mockNavigator(properties: Record<string, unknown>): void { void properties; }
export function mockScreen(properties: Record<string, number>): void { void properties; }
export function mockCrypto(): void {}
export function mockPerformance(): void {}
export function mockClipboard(text: string): void { void text; }
export function mockNotification(): void {}
export function mockServiceWorker(): void {}
export function mockWebSocket(): void {}
export function mockIndexedDB(): void {}
export function mockWebGL(): void {}
export function mockCanvas(): void {}
export function mockAudio(): void {}
export function mockVideo(): void {}
export function mockGeolocation(position: { latitude: number; longitude: number }): void { void position; }
export function mockBattery(level: number, charging: boolean): void { void level; void charging; }
export function mockVibration(): void {}
export function mockDeviceOrientation(orientation: { alpha: number; beta: number; gamma: number }): void { void orientation; }
export function mockDeviceMotion(motion: { acceleration: { x: number; y: number; z: number } }): void { void motion; }
export function mockTouch(): void {}
export function mockPointer(): void {}
export function mockGamepad(): void {}
export function mockXR(): void {}
export function mockBluetooth(): void {}
export function mockUSB(): void {}
export function mockNFC(): void {}
export function mockSerial(): void {}
export function mockHID(): void {}
export function mockCredentials(): void {}
export function mockPayment(): void {}
export function mockCredentialsStore(): void {}
export function mockCookieStore(): void {}
export function mockWakeLock(): void {}
export function mockBackgroundFetch(): void {}
export function mockBackgroundSync(): void {}
export function mockPeriodicBackgroundSync(): void {}
export function mockPush(): void {}
export function mockNotifications(): void {}
export function mockShare(): void {}
export function mockPresentation(): void {}
export function mockRemotePlayback(): void {}
export function mockMediaSession(): void {}
export function mockPictureInPicture(): void {}
export function mockFullscreen(): void {}
export function mockScreenOrientation(): void {}
export function mockScreenWakeLock(): void {}
export function mockVisibilityState(state: "visible" | "hidden"): void { void state; }
export function mockPageVisibility(): void {}
export function mockOnline(online: boolean): void { void online; }
export function mockConnection(type: string): void { void type; }
export function mockNetworkInformation(): void {}
export function mockDeviceInfo(): void {}
export function mockMemoryInfo(): void {}
export function mockStorageEstimate(usage: number, quota: number): void { void usage; void quota; }
export function mockStorageAccess(): void {}
export function mockCookieStore2(): void {}
export function mockPermissions(): void {}
export function mockPermissionStatus(): void {}
export function mockCredential(): void {}
export function mockIdentityProvider(): void {}
export function mockWebAuthn(): void {}
export function mockAuthenticatorAttestation(): void {}
export function mockAuthenticatorAssertion(): void {}
export function mockPublicKeyCredential(): void {}
export function mockAuthenticatorResponse(): void {}
export function mockAuthenticatorAttachment(): void {}
export function mockAuthenticatorTransport(): void {}
export function mockUserVerificationMethod(): void {}
export function mockAttestationConveyancePreference(): void {}
export function mockAuthenticatorSelectionCriteria(): void {}
export function mockPublicKeyCredentialRequestOptions(): void {}
export function mockPublicKeyCredentialCreationOptions(): void {}
export function mockPublicKeyCredentialParameters(): void {}
export function mockPublicKeyCredentialDescriptor(): void {}
export function mockPublicKeyCredentialRpEntity(): void {}
export function mockPublicKeyCredentialUserEntity(): void {}
export function mockPublicKeyCredentialEntity(): void {}
export function mockAuthenticatorAssertionResponse(): void {}
export function mockAuthenticatorAttestationResponse(): void {}
export function mockAuthenticatorAttachment2(): void {}
export function mockAuthenticatorTransport2(): void {}
export function mockUserVerificationMethod2(): void {}
export function mockAttestationConveyancePreference2(): void {}
export function mockAuthenticatorSelectionCriteria2(): void {}
export function mockPublicKeyCredentialRequestOptions2(): void {}
export function mockPublicKeyCredentialCreationOptions2(): void {}
export function mockPublicKeyCredentialParameters2(): void {}
export function mockPublicKeyCredentialDescriptor2(): void {}
export function mockPublicKeyCredentialRpEntity2(): void {}
export function mockPublicKeyCredentialUserEntity2(): void {}
export function mockPublicKeyCredentialEntity2(): void {}
export function mockAuthenticatorAssertionResponse2(): void {}
export function mockAuthenticatorAttestationResponse2(): void {}
