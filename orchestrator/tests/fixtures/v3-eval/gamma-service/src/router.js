import { loadConfig } from './config.js';
import { isAuthorized } from './auth.js';
export function handle(req) {
  const cfg = loadConfig();
  if (!isAuthorized(req.token, cfg.featureFlags)) return { status: 401, body: 'denied' };
  if (req.path === '/health') return { status: 200, body: 'ok' };
  if (req.path === '/version') return { status: 200, body: cfg.version };
  return { status: 404, body: 'missing' };
}
// TODO: /echo not implemented
