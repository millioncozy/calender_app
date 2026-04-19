# Calendar App (친구 일정 공유)

A calendar application with user authentication, friend management, and schedule sharing.

## Architecture

- **Backend**: Node.js + Express on port 3000 (`server.js`)
- **Frontend**: React + Vite on port 5000 (`frontend/`)

## Key Features

- JWT-based user authentication (register/login)
- Friend search and management
- Create and view schedules on a calendar
- View friends' schedules alongside your own

## Tech Stack

- **Frontend**: React 18, Vite, axios, react-calendar
- **Backend**: Express, bcryptjs, jsonwebtoken, uuid
- **Database**: In-memory (arrays in server.js — resets on restart)

## Project Structure

```
/
├── server.js          # Express API server
├── package.json       # Backend dependencies
└── frontend/
    ├── src/
    │   ├── App.jsx    # Main React component
    │   └── main.jsx   # React entry point
    ├── vite.config.js # Vite config (port 5000, proxy to backend)
    └── package.json   # Frontend dependencies
```

## Development

- Backend workflow: `node server.js` (port 3000)
- Frontend workflow: `cd frontend && npm run dev` (port 5000, proxies API to backend)

## API Proxy

Vite proxies `/auth`, `/users`, `/friends`, `/schedules` to `http://localhost:3000`.

## Deployment

- Build: `cd frontend && npm install && npm run build`
- Run: `node server.js & npx serve frontend/dist -l 5000`
- Target: autoscale
