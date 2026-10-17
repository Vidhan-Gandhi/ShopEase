function parseTrustProxy(v) {
  if (v === undefined || v === null || v === '') return false;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

function jwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
}

module.exports = { parseTrustProxy, jwtSecret, JWT_EXPIRES_IN: '7d' };
