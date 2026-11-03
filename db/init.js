// 사용법: npm run db:init  (.env 의 DATABASE_URL 로 테이블 생성)
require('dotenv').config();
const { ensureSchema, getPool } = require('../lib/db');

ensureSchema()
  .then(() => console.log('expense_entries 테이블 준비 완료'))
  .catch((err) => {
    console.error('스키마 생성 실패:', err.message);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
