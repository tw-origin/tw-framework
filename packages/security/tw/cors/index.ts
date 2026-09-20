/** CORS module -- handler, preflight, origin validation. */

export { CORSHandler, createCORSHandler, permissiveCORS, strictCORS } from "./handler";
export type { CORSConfig, CORSResult } from "./handler";
