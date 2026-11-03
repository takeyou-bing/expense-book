# 가계부 (Expense Book)

HTML/CSS/JavaScript + Node.js(Express) + Neon PostgreSQL 기반 개인 가계부입니다. Vercel에 배포할 수 있습니다.

## 기능

- 지출 내역 추가 / 조회 / 수정 / 삭제 (날짜, 항목, 카테고리, 금액)
- 날짜별 검색 (특정 날짜, 기간, "오늘" 버튼)
- 월별 지출 합계 (연도 선택)
- 카테고리별 지출 합계 + 막대그래프 (월 선택, 표로 보기)
- 비밀번호 로그인 (`APP_PASSWORD`), HttpOnly 서명 쿠키 세션 (7일)

## 프로젝트 구조

```
├── api/index.js     # Vercel 서버리스 함수 진입점 (app.js 재사용)
├── app.js           # Express 앱 (API 라우트)
├── server.js        # 로컬 실행용 (app.listen)
├── lib/
│   ├── auth.js      # 비밀번호 확인, 세션 쿠키 서명/검증
│   ├── db.js        # Neon 연결 풀 (DATABASE_URL), 최초 요청 시 테이블 자동 생성
│   └── schema.js    # expense_entries 테이블 DDL
├── db/init.js       # 테이블 수동 생성 스크립트 (npm run db:init)
├── public/          # 프런트엔드 (index.html, style.css, app.js)
└── vercel.json
```

## 로컬 실행

1. [Neon](https://neon.tech)에서 프로젝트를 만들고 연결 문자열을 복사합니다.
2. `.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.
   ```
   DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
   APP_PASSWORD=원하는-비밀번호
   ```
3. 설치 및 실행
   ```bash
   npm install
   npm run db:init   # 선택: 테이블 미리 생성 (안 해도 첫 요청 때 자동 생성)
   npm start         # 또는 npm run dev (파일 변경 시 자동 재시작)
   ```
4. http://localhost:3000 접속

## Vercel 배포

1. GitHub에 저장소를 만들고 푸시합니다. (`.env`는 `.gitignore`에 포함되어 올라가지 않습니다.)
   ```bash
   git init
   git add .
   git commit -m "가계부 초기 버전"
   git branch -M main
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
2. Vercel에서 **Add New → Project** → GitHub 저장소 선택 → Import
3. **Settings → Environment Variables**에 추가
   - `DATABASE_URL` : Neon 연결 문자열
   - `APP_PASSWORD` : 로그인 비밀번호
   - (선택) `SESSION_SECRET` : 긴 임의 문자열
4. Deploy (환경변수를 배포 후에 추가했다면 **Redeploy** 필요)

> Vercel 대시보드의 Neon 통합(Storage → Neon)을 사용하면 `DATABASE_URL`이 자동으로 등록됩니다.

## 보안

- DB 접속 정보는 서버 환경변수에만 있고 브라우저로 전달되지 않습니다. 모든 DB 접근은 `/api`를 통해 서버에서만 이뤄집니다.
- 서버 오류 시 상세 메시지(접속 정보 포함 가능)는 서버 로그에만 남고, 클라이언트에는 일반 메시지만 반환합니다.
- 모든 쿼리는 파라미터 바인딩을 사용합니다 (SQL 인젝션 방지).
- 로그인 쿠키: `HttpOnly`, `SameSite=Strict`, 배포 환경에서는 `Secure`. 비밀번호 비교는 타이밍 공격에 안전한 방식, 실패 시 0.5초 지연.
- `APP_PASSWORD`(또는 `SESSION_SECRET`)를 바꾸면 기존 로그인 세션이 모두 만료됩니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/login` | `{ password }` 로그인 |
| POST | `/api/logout` | 로그아웃 |
| GET | `/api/session` | 로그인 여부 |
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/expenses` | 목록 (`?date=YYYY-MM-DD` / `?from=&to=` / `?month=YYYY-MM`) |
| POST | `/api/expenses` | 추가 `{ spent_on, item, category, amount }` |
| PUT | `/api/expenses/:id` | 수정 |
| DELETE | `/api/expenses/:id` | 삭제 |
| GET | `/api/summary/monthly` | 월별 합계 (`?year=YYYY`) |
| GET | `/api/summary/category` | 카테고리별 합계 (`?month=YYYY-MM`) |

로그인/로그아웃/세션 외 모든 API는 로그인이 필요합니다.
