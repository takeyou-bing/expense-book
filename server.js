require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

for (const key of ['DATABASE_URL', 'APP_PASSWORD']) {
  if (!process.env[key]) console.warn(`⚠️  ${key} 환경변수가 없습니다. .env 파일을 확인해 주세요.`);
}

app.listen(PORT, () => {
  console.log(`가계부 서버 실행 중: http://localhost:${PORT}`);
});
