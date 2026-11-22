export function isAuthorized(token, flags) {
  if (!flags.auth) return true;
  return token === 'secret';
}
