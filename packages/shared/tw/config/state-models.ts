/**
 * State model (strategies.state.model): how a project holds client state.
 *
 *   signals (default) -- TW signals: public/private/serverOnly/derived.
 *   hooks             -- React-style hooks; needs a React-compatible renderer.
 *   store             -- an external store (Redux/Zustand-style) via defineStore.
 */

export type StateModelName = "signals" | "hooks" | "store";

export interface StateModelInfo {
  model: StateModelName;
  detail: string;
  /** The render engines this model can run on. */
  requiresRenderer: Array<"tw-vdom" | "react" | "preact">;
}

export const STATE_MODELS: Record<StateModelName, StateModelInfo> = {
  signals: { model: "signals", detail: "TW signals (public/private/serverOnly/derived)", requiresRenderer: ["tw-vdom", "react", "preact"] },
  hooks: { model: "hooks", detail: "React-style hooks (useState/useEffect)", requiresRenderer: ["react", "preact"] },
  store: { model: "store", detail: "external store adapter (defineStore)", requiresRenderer: ["tw-vdom", "react", "preact"] },
};

/** Resolve the configured state model, defaulting to signals. */
export function resolveStateModel(cfg: any): StateModelName {
  const m = cfg?.strategies?.state?.model;
  return m === "hooks" || m === "store" ? m : "signals";
}

/** Describe a model, and whether the chosen renderer can host it. */
export function describeStateModel(model: string, renderEngine: string): StateModelInfo & { available: boolean; fix?: string } {
  const info = STATE_MODELS[(model as StateModelName)] ?? STATE_MODELS.signals;
  const ok = info.requiresRenderer.includes(renderEngine as any);
  return {
    ...info,
    available: ok,
    ...(ok ? {} : {
      fix: `state.model=${info.model} needs render.engine=${info.requiresRenderer.join(" | ")} (currently ${renderEngine})`,
    }),
  };
}
