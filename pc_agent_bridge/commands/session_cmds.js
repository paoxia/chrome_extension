// commands/session_cmds.js
export function makeSessionCommands(session) {
  return {
    ping: async () => ({ pong: true }),
    open_session: async ({ url } = {}) => session.openSession({ url }),
    close_session: async () => session.closeSession('agent_request'),
  };
}
