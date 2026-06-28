// router.js — dispatch incoming request msgs to handler(params, ctx) → data
const log = (...a) => console.log('[router]', ...a);

export function createRouter() {
  const handlers = new Map();
  function register(type, fn) { handlers.set(type, fn); }

  async function handle(msg, ctx) {
    if (msg.type !== 'result' && msg.type !== 'event' && msg.id) {
      const fn = handlers.get(msg.type);
      if (!fn) {
        return { id: msg.id, type: 'result', ok: false,
                 error: { code: 'bad_params', message: `unknown type: ${msg.type}` } };
      }
      try {
        const data = await fn(msg.params || {}, ctx);
        return { id: msg.id, type: 'result', ok: true, data: data || {} };
      } catch (e) {
        const err = (e && e.code) ? e : { code: 'script_error', message: String(e?.message || e) };
        log('handler error', msg.type, err);
        return { id: msg.id, type: 'result', ok: false, error: err };
      }
    }
    return null;
  }
  return { register, handle };
}
