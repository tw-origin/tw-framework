/**
 * A tiny server-side session store for the sample app.
 *
 * The store lives on `globalThis` so the framework's `sessionMiddleware` and the
 * login route resolve the SAME map even though they are loaded through different
 * module systems (the middleware from the server, the route through the .twm
 * loader). In a real app this would be Redis or a database table.
 */

interface SessionRecord {
  userId: string;
  data: Record<string, unknown>;
}

const g = globalThis as unknown as { __serverDataSessions?: Map<string, SessionRecord> };
export const sessionStore: Map<string, SessionRecord> = (g.__serverDataSessions ??= new Map());

export function createSession(userId: string, data: Record<string, unknown>): string {
  const sid = "sid_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  sessionStore.set(sid, { userId, data });
  return sid;
}

export function destroySession(sid: string): void {
  sessionStore.delete(sid);
}
