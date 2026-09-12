function asPort(value, fallback){
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return port;
}
const NODE_ENV = process.env.NODE_ENV || 'development';
const configuredOrigin = (process.env.ALLOWED_ORIGIN || '').trim();
const defaultDevOrigin = 'http://localhost:3000';
if (NODE_ENV === 'production' && !configuredOrigin) {
  throw new Error('ALLOWED_ORIGIN must be configured in production');
}
export const env = Object.freeze({
  NODE_ENV,
  PORT: asPort(process.env.PORT, 8787),
  ALLOWED_ORIGIN: configuredOrigin || defaultDevOrigin,
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  MAX_BODY_BYTES: 64 * 1024
});
