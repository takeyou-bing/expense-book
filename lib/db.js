const { Pool, types } = require('pg');
const schemaSql = require('./schema');

// DATE 컬럼을 JS Date 객체가 아닌 'YYYY-MM-DD' 문자열로 받는다 (시간대 밀림 방지)
types.setTypeParser(1082, (v) => v);
// BIGINT(SUM 결과 등)를 숫자로 변환
types.setTypeParser(20, (v) => Number(v));

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
    }
    pool = new Pool({
      // pg 는 require/prefer 를 verify-full 로 취급하며 경고를 띄우므로 명시적으로 바꿔 둔다
      connectionString: process.env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)\b/, 'sslmode=verify-full'),
      // Neon 은 SSL 필수. 로컬 Postgres 테스트 시에만 URL 에 sslmode=disable 지정
      ssl: /sslmode=disable/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

let schemaReady;

// 첫 쿼리 전에 테이블이 없으면 생성 (서버리스 인스턴스마다 한 번만 실행)
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(schemaSql).catch((err) => {
      schemaReady = undefined;
      throw err;
    });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

module.exports = { query, ensureSchema, getPool };
