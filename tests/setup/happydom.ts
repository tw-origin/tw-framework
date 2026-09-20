/**
 * Test preload -- registers a happy-dom global environment so tests that
 * touch `document`, `window`, `KeyboardEvent`, etc. work under `bun test`
 * (Bun's test runner does not provide a DOM by default).
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
