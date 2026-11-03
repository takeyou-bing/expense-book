const path = require('path');
const express = require('express');
const db = require('./lib/db');
const auth = require('./lib/auth');

const CATEGORIES = ['식비', '교통', '주거', '통신', '쇼핑', '의료', '문화/여가', '교육', '경조사', '기타'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseExpense(body) {
  const { spent_on, item, category, amount } = body || {};
  if (!isValidDate(spent_on)) throw new HttpError(400, '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)');
  const name = typeof item === 'string' ? item.trim() : '';
  if (!name || name.length > 100) throw new HttpError(400, '항목은 1~100자로 입력해 주세요.');
  if (!CATEGORIES.includes(category)) throw new HttpError(400, '카테고리가 올바르지 않습니다.');
  const amt = Number(amount);
  if (!Number.isSafeInteger(amt) || amt < 0) throw new HttpError(400, '금액은 0 이상의 정수로 입력해 주세요.');
  return { spent_on, item: name, category, amount: amt };
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '잘못된 ID입니다.');
  return id;
}

// 'YYYY-MM' → [그 달 1일, 다음 달 1일)
function monthRange(month) {
  if (typeof month !== 'string' || !MONTH_RE.test(month)) throw new HttpError(400, '월 형식이 올바르지 않습니다. (YYYY-MM)');
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) throw new HttpError(400, '월 형식이 올바르지 않습니다. (YYYY-MM)');
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [`${month}-01`, next];
}

/* ---------- 인증 ---------- */

app.post('/api/login', async (req, res) => {
  const ok = auth.checkPassword(req.body?.password);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 500)); // 무차별 대입 속도 늦추기
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  res.cookie(auth.COOKIE_NAME, auth.createToken(), { ...auth.cookieOptions(), maxAge: auth.SESSION_TTL_MS });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(auth.COOKIE_NAME, auth.cookieOptions());
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: auth.isAuthenticated(req) });
});

/* ---------- 이하 모든 /api 는 로그인 필요 ---------- */

app.use('/api', auth.requireAuth);

app.get('/api/categories', (req, res) => res.json(CATEGORIES));

// 목록 조회: ?date=YYYY-MM-DD 또는 ?from=&to= 또는 ?month=YYYY-MM
app.get('/api/expenses', async (req, res) => {
  const { date, from, to, month } = req.query;
  const where = [];
  const params = [];

  if (date) {
    if (!isValidDate(date)) throw new HttpError(400, '날짜 형식이 올바르지 않습니다.');
    params.push(date);
    where.push(`spent_on = $${params.length}`);
  } else if (month) {
    const [start, end] = monthRange(month);
    params.push(start, end);
    where.push(`spent_on >= $${params.length - 1} AND spent_on < $${params.length}`);
  } else {
    if (from) {
      if (!isValidDate(from)) throw new HttpError(400, '시작 날짜 형식이 올바르지 않습니다.');
      params.push(from);
      where.push(`spent_on >= $${params.length}`);
    }
    if (to) {
      if (!isValidDate(to)) throw new HttpError(400, '종료 날짜 형식이 올바르지 않습니다.');
      params.push(to);
      where.push(`spent_on <= $${params.length}`);
    }
  }

  const sql = `SELECT id, spent_on, item, category, amount FROM expense_entries
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY spent_on DESC, id DESC
               LIMIT 1000`;
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

app.post('/api/expenses', async (req, res) => {
  const e = parseExpense(req.body);
  const { rows } = await db.query(
    `INSERT INTO expense_entries (spent_on, item, category, amount) VALUES ($1, $2, $3, $4)
     RETURNING id, spent_on, item, category, amount`,
    [e.spent_on, e.item, e.category, e.amount]
  );
  res.status(201).json(rows[0]);
});

app.put('/api/expenses/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const e = parseExpense(req.body);
  const { rows } = await db.query(
    `UPDATE expense_entries SET spent_on = $1, item = $2, category = $3, amount = $4, updated_at = now()
     WHERE id = $5 RETURNING id, spent_on, item, category, amount`,
    [e.spent_on, e.item, e.category, e.amount, id]
  );
  if (!rows.length) throw new HttpError(404, '내역을 찾을 수 없습니다.');
  res.json(rows[0]);
});

app.delete('/api/expenses/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await db.query('DELETE FROM expense_entries WHERE id = $1', [id]);
  if (!rowCount) throw new HttpError(404, '내역을 찾을 수 없습니다.');
  res.status(204).end();
});

// 월별 합계: ?year=YYYY (생략 시 전체)
app.get('/api/summary/monthly', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.year) {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new HttpError(400, '연도가 올바르지 않습니다.');
    params.push(`${year}-01-01`, `${year + 1}-01-01`);
    where = 'WHERE spent_on >= $1 AND spent_on < $2';
  }
  const { rows } = await db.query(
    `SELECT to_char(spent_on, 'YYYY-MM') AS month, SUM(amount)::bigint AS total, COUNT(*)::bigint AS count
     FROM expense_entries ${where}
     GROUP BY 1 ORDER BY 1 DESC`,
    params
  );
  res.json(rows);
});

// 카테고리별 합계: ?month=YYYY-MM (생략 시 전체 기간)
app.get('/api/summary/category', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.month) {
    params.push(...monthRange(req.query.month));
    where = 'WHERE spent_on >= $1 AND spent_on < $2';
  }
  const { rows } = await db.query(
    `SELECT category, SUM(amount)::bigint AS total, COUNT(*)::bigint AS count
     FROM expense_entries ${where}
     GROUP BY category ORDER BY total DESC`,
    params
  );
  res.json(rows);
});

app.use('/api', (req, res) => res.status(404).json({ error: '존재하지 않는 API입니다.' }));

// 에러 처리: DB 접속 정보 등 내부 메시지는 클라이언트에 노출하지 않는다
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

module.exports = app;
