/**
 * TW Framework CLI — Node.js entry.
 * The same code runs on Bun (bin.ts); this entry is bundled to plain JS
 * (dist/tw.js) so Node users can run the framework without installing Bun.
 */
import "./node-adapter";
import { run } from "./commands/index";

run();
