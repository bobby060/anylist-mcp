// In-memory registry of live MCP transport sessions, each owned by the user
// who created it. Sessions are keyed by the transport's session id, but a
// lookup also requires the requesting user's id to match: a valid bearer
// token for one user must not be able to drive another user's session (and so
// reach another user's AnyList account) by presenting their Mcp-Session-Id.
//
// A session unused for `idleMs` is closed. Its client gets a 404 for the old
// id and starts a new session.
export function createSessionStore({ idleMs } = {}) {
  const sessions = new Map();
  const timers = new Map();

  function touch(id) {
    if (!idleMs) return;
    clearTimeout(timers.get(id));
    const timer = setTimeout(() => {
      const entry = sessions.get(id);
      sessions.delete(id);
      timers.delete(id);
      entry?.server.close().catch((err) => console.error(`Closing idle MCP session: ${err.message}`));
    }, idleMs);
    timer.unref();
    timers.set(id, timer);
  }

  return {
    set(id, entry) {
      sessions.set(id, entry);
      touch(id);
    },
    delete(id) {
      sessions.delete(id);
      clearTimeout(timers.get(id));
      timers.delete(id);
    },
    // Return the session only if it exists and belongs to userId; otherwise
    // null, which callers treat the same as an unknown session.
    get(id, userId) {
      const entry = sessions.get(id);
      if (!entry || entry.userId !== userId) return null;
      touch(id);
      return entry;
    },
  };
}
