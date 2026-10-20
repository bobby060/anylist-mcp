// In-memory registry of live MCP transport sessions, each owned by the user
// who created it. Sessions are keyed by the transport's session id, but a
// lookup also requires the requesting user's id to match: a valid bearer
// token for one user must not be able to drive another user's session (and so
// reach another user's AnyList account) by presenting their Mcp-Session-Id.
export function createSessionStore() {
  const sessions = new Map();
  return {
    set(id, entry) {
      sessions.set(id, entry);
    },
    delete(id) {
      sessions.delete(id);
    },
    // Return the session only if it exists and belongs to userId; otherwise
    // null, which callers treat the same as an unknown session.
    get(id, userId) {
      const entry = sessions.get(id);
      if (!entry || entry.userId !== userId) return null;
      return entry;
    },
  };
}
