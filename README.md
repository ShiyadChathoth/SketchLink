# SketchLink

Realtime multiplayer drawing and guessing game.

## Stack
- Frontend: `index.html`, `script.js`, `style.css` (HTML5 Canvas + Socket.io client)
- Backend: `Node.js` + `Express` + `Socket.io` (`server.js`)
- Frontend hosting: Vercel
- Backend hosting: Raspberry Pi (recommended with Tailscale Funnel)

## Features
- Room-based gameplay (`join-room`)
- Live drawing sync (`draw-data` -> `render-line`)
- Guessing with scoring (`submit-guess`)
- Exact match scoring:
  - Guesser: `+100`
  - Drawer: `+50`
- Close guess feedback (1 edit away): `"You're so close!"`
- Automatic drawer rotation after correct guess or timeout
- Canvas clear on each new round

## Project Structure
```text
.
├── server.js
├── package.json
├── index.html
├── script.js
├── style.css
├── env.js
├── vercel.json
├── .env.backend.example
├── .env.frontend.example
└── scripts
    ├── generate-env.js
    └── smoke-test.js
```

## Backend Setup (Raspberry Pi)
1. Install dependencies:
```bash
npm install
```
2. Create backend env from template:
```bash
cp .env.backend.example .env
```
3. Set `ALLOWED_ORIGINS` to your deployed frontend URL(s), comma-separated.
4. Run server:
```bash
npm start
```

Default port is `3001`.

## Frontend Config (Vercel)
Set this environment variable in Vercel Project Settings:
- `NEXT_PUBLIC_SOCKET_URL=https://your-pi-funnel-url`

Vercel runs:
```bash
npm run build:frontend
```
This generates `env.js` with `NEXT_PUBLIC_SOCKET_URL` injected for runtime use.

## Local Development
Run backend:
```bash
npm run dev
```

Open `index.html` in a browser (or serve static files) and connect to:
- `http://localhost:3001` (default fallback)

## Smoke Test
This validates socket flow end-to-end:
- join room
- draw propagation
- close-guess feedback
- correct-guess event

```bash
npm run smoke:test
```

## Deploy Notes
- Backend must allow the Vercel origin via `ALLOWED_ORIGINS`.
- Frontend must point to public backend URL via `NEXT_PUBLIC_SOCKET_URL`.
- `vercel.json` includes rewrite to `index.html` and disables cache for `env.js`.
