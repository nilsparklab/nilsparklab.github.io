export function applySecurityHeaders(res, production = false){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-site');
  res.setHeader('X-Permitted-Cross-Domain-Policies','none');
  if (production) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}
