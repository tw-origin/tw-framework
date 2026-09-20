/** FS barrel - re-exports from split sub-modules. */

// readFile is async -- export from async.ts

export { atomicWrite, chmodSync, copyDir, copyFileSync, existsSync, fileSizeStr, getMimeType, globMatch, isBinary, mkdirp, readFileBytes, readFileSync, readJSON, readOr, readdirSync, removeSync, renameSync, statSync, tempFile, writeFileSync, writeJSON } from "./async";
export { walk } from "./glob";
export { FileLock, atomicWriteSync, copyDirSync, globSync, mkdirSync, readJSONSync, readOrSync, tempFileSync, walkSync, writeJSONSync } from "./sync";
export type { WalkOptions, WatchEvent, WatchOptions } from "./sync";
export { watch } from "./watch";
