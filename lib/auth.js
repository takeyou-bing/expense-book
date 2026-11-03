const crypto = require('crypto');

const COOKIE_NAME = 'eb_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// 세션 서명 키: SESSION_SECRET 이 있으면 사용, 없으면 APP_PASSWORD 에서 파생.
// 비밀번호를 바꾸면 기존 세션은 모두 무효가 된다.
function secretKey() {
  const base = process.env.SESSION_SECRET || process.env.APP_PASSWORD;
  if (!base) throw new Error('APP_PASSWORD 환경변수가 설정되지 않았습니다.');
  return crypto.createHash('sha256').update('expense-book-session:' + base).digest();
}

function sign(payload) {
  return crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
    path: '/',
  };
}

function checkPassword(input) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error('APP_PASSWORD 환경변수가 설정되지 않았습니다.');
  return typeof input === 'string' && safeEqual(input, expected);
}

function isAuthenticated(req) {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  createToken,
  checkPassword,
  isAuthenticated,
  requireAuth,
  cookieOptions,
};
