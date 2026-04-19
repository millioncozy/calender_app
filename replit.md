# 보라매의 꿈 (캘린더 앱)

친구와 일정을 공유하는 소셜 캘린더 모바일 웹앱

## 아키텍처

- **Backend**: Node.js + Express (port 3000) — `server.js`
- **Frontend**: React + Vite (port 5000) — `frontend/`
- **Database**: Replit 내장 PostgreSQL

## 주요 기능

- JWT 기반 회원가입/로그인
- 친구 요청 시스템 (보내기/받기/수락/거절/취소)
- 일정 추가/수정/삭제 (본인 일정만)
- 친구 일정 함께 보기
- 모바일 최적화 UI (3탭: 홈/친구/프로필)

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| Frontend | React 18, Vite, axios, react-calendar |
| Backend | Express, bcryptjs, jsonwebtoken, pg |
| Database | PostgreSQL (Replit 내장) |

## 프로젝트 구조

```
/
├── server.js          # Express API 서버 (PostgreSQL 연동)
├── package.json       # 백엔드 의존성
└── frontend/
    ├── src/
    │   ├── App.jsx    # 메인 React 컴포넌트
    │   ├── App.css    # 모바일 최적화 스타일
    │   └── main.jsx
    ├── vite.config.js # 포트 5000, 백엔드 프록시 설정
    └── package.json
```

## DB 테이블

- `users` — 회원 정보
- `schedules` — 일정
- `friendships` — 친구 관계 (양방향)
- `friend_requests` — 친구 요청 (pending/accepted)

## 워크플로우

- **Backend**: `node server.js` (port 3000)
- **Start application**: `cd frontend && npm run dev` (port 5000)

## 환경변수 / Secrets

- `JWT_SECRET` — JWT 서명 키 (Secrets 등록 필요)
- `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — DB 연결 (자동 설정)
- `VITE_API_BASE_URL` — 프론트 API 주소 (미설정 시 빈 문자열 = Vite 프록시 사용)

## 배포 설정

- Build: `cd frontend && npm install && npm run build`
- Run: `node server.js & npx serve frontend/dist -l 5000`
- Target: autoscale
