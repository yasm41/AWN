# Awn Backend API

> Node.js + MongoDB backend for **Awn** — an intelligent educational assistant that scans lecture materials, generates AI summaries, and recommends YouTube videos per topic.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [How the Code Works](#how-the-code-works)
- [Authentication & Security](#authentication--security)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)

---

## Overview

When a student uploads a lecture file (PDF, DOCX, PPTX, image, etc.), the backend:

1. Saves the file to disk and creates a database record immediately
2. Sends the file asynchronously to an AI service (HuggingFace Space) that extracts topics and generates summaries
3. For each topic, fetches 3 related YouTube videos via the YouTube Data API
4. Stores everything in MongoDB so the mobile app can retrieve it at any time

Authentication uses short-lived JWT access tokens (15 min) paired with long-lived refresh tokens (7 days) stored in MongoDB with full rotation and reuse detection. Email verification via OTP is required before a user can upload documents.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js + Express | Fast, lightweight HTTP server |
| Database | MongoDB + Mongoose | Flexible schema for topics/videos |
| Auth | JWT (access + refresh) | Stateless access, revocable sessions |
| File Upload | Multer | Multipart form handling |
| Email | Nodemailer | OTP delivery via SMTP |
| AI Service | HuggingFace Gradio | Topic extraction + summarization |
| YouTube | YouTube Data API v3 | Video recommendations per topic |
| Testing | Jest + Supertest + mongodb-memory-server | Full integration tests, no real DB needed |

---

## Project Structure

```
awn-backend/
│
├── src/
│   ├── server.js                   Entry point — connects DB, starts Express
│   ├── app.js                      Express setup: CORS, Helmet, rate limiting, routes
│   │
│   ├── config/
│   │   └── db.js                   Mongoose connection helper
│   │
│   ├── models/
│   │   ├── User.js                 User schema (hashed password, refresh tokens array)
│   │   ├── Document.js             Uploaded file + topics + videos schema
│   │   └── Otp.js                  OTP schema (hashed code, expiry, attempt tracking)
│   │
│   ├── controllers/
│   │   ├── authController.js       Register, login, refresh, logout, profile, password
│   │   ├── otpController.js        Send OTP, verify email, resend OTP
│   │   └── documentController.js  Upload, list, get, status poll, delete, refresh videos
│   │
│   ├── middleware/
│   │   ├── auth.js                 Reads Bearer token → populates req.user
│   │   ├── requireVerified.js      Blocks unverified users from uploading
│   │   ├── upload.js               Multer config (file type + size validation)
│   │   └── validators.js           express-validator rules for all request bodies
│   │
│   ├── routes/
│   │   ├── authRoutes.js           Maps /api/auth/* to auth + OTP controllers
│   │   └── documentRoutes.js       Maps /api/documents/* to document controller
│   │
│   ├── services/
│   │   ├── aiService.js            Sends file to HuggingFace Space, parses response
│   │   ├── youtubeService.js       Searches YouTube Data API v3
│   │   └── emailService.js         Nodemailer transporter + branded OTP email template
│   │
│   └── utils/
│       ├── jwt.js                  sign/verify access and refresh tokens
│       └── response.js             success() and error() response helpers
│
├── tests/
│   ├── helpers/
│   │   ├── db.js                   Spins up in-memory MongoDB for tests
│   │   └── factories.js            Creates test users, tokens, documents
│   ├── auth/
│   │   ├── register.test.js
│   │   ├── login.test.js
│   │   ├── refresh.test.js
│   │   ├── profile.test.js
│   │   └── otp.test.js
│   ├── documents/
│   │   ├── upload.test.js
│   │   └── crud.test.js
│   └── services/
│       └── jwt.test.js
│
├── uploads/                        Uploaded files stored here (gitignored)
├── .env.example                    All required environment variables
└── package.json
```

---

## How the Code Works

### Entry point — `server.js` + `app.js`

`server.js` is minimal: it loads `.env`, ensures the `uploads/` directory exists, connects to MongoDB, then starts Express. All the real setup lives in `app.js`.

`app.js` registers middleware in a deliberate order — CORS must come before Helmet so that rate-limit and error responses still carry the correct `Access-Control-*` headers. Rate limiters use a `handler` function (not a plain `message` object) so the JSON body is always written. Rate limiting is skipped entirely when `NODE_ENV=test`.

### Models

**`User.js`** — The password is bcrypt-hashed in a `pre('save')` hook so it's impossible to accidentally store plaintext. The `refreshTokens` field is an array of objects, each holding a token hash, device info, and expiry date. The `toJSON()` method strips `password` and `refreshTokens` from every API response automatically.

**`Document.js`** — Stores the file metadata and a `topics` array. Each topic has a `title`, `summary`, and a `videos` array. The `status` field (`pending → processing → done | failed`) lets the mobile app poll for progress without fetching the full document.

**`Otp.js`** — Stores a bcrypt-hashed OTP (never the raw code), an expiry timestamp with a MongoDB TTL index (so expired records delete themselves automatically), and `attempts` / `resendCount` fields for brute-force and rate-limit protection.

### Controllers

**`authController.js`** handles the full auth lifecycle. On login, it calls `user.purgeExpiredTokens()` before adding a new refresh token to keep the array clean. On `refresh`, it validates that the token exists in the database — if it doesn't (meaning it was already rotated), it wipes all sessions as a reuse-attack response. `changePassword` revokes all refresh tokens so stolen sessions are immediately invalidated.

**`otpController.js`** — `sendOtp` deletes any existing OTP for the user before creating a fresh one, so there's never more than one active code. `verifyEmail` increments `attempts` on each wrong guess and deletes the OTP record after 5 failures. `resendOtp` enforces a 60-second cooldown between requests and a maximum of 3 resends per hour.

**`documentController.js`** — `uploadDocument` responds with 202 immediately after creating the DB record, then kicks off AI processing asynchronously. This prevents the HTTP request from timing out on large files or slow AI responses. The function calls `aiService.processDocument()` and then enriches each returned topic with YouTube videos if the AI didn't already include them.

### Services

**`aiService.js`** reads the uploaded file, base64-encodes it, and POSTs it to the HuggingFace Gradio `/run/predict` endpoint with a 5-minute timeout. The response parser handles both structured JSON output (preferred) and raw text output (fallback), so it's resilient to changes in the AI model's response format.

**`youtubeService.js`** is a thin wrapper around the YouTube Data API v3 search endpoint. It returns title, channel, video ID, thumbnail URL, and full watch link for each result. If the API key is missing it logs a warning and returns an empty array rather than crashing.

**`emailService.js`** builds a Nodemailer transporter from SMTP environment variables. In `development` or `test` mode it skips SMTP entirely and prints the OTP to the console so you can test without configuring email. The HTML email template is self-contained inline CSS — no external dependencies.

### Middleware

**`auth.js`** — Extracts the Bearer token from the `Authorization` header, verifies it with the access secret, and loads the full user from MongoDB. Distinguishes between expired tokens (returns a specific message so the client knows to refresh) and invalid tokens.

**`requireVerified.js`** — A single-purpose guard that checks `req.user.isVerified` and returns 403 with a clear message if false. It sits between `protect` and `upload.single()` in the document upload route.

**`upload.js`** — Multer configured with disk storage. Files are renamed to a UUID to prevent collisions and path traversal. The `fileFilter` rejects unsupported MIME types before the file hits the disk. A separate `handleUploadError` middleware translates Multer errors into the standard API response shape.

### Utils

**`jwt.js`** — Thin wrappers around `jsonwebtoken`. Access tokens and refresh tokens use separate secrets so a leaked refresh secret can't be used to forge access tokens. `refreshTokenExpiresAt()` returns a `Date` object for storage in MongoDB, enabling the TTL-based cleanup in `User.purgeExpiredTokens()`.

**`response.js`** — Two functions (`success` and `error`) that enforce a consistent `{ success, message, data }` shape across every endpoint. This means the mobile app only needs one response parser.

---

## Authentication & Security

### Token flow

```
Register / Login
      │
      ▼
accessToken (JWT, 15 min)  ←── sent with every API request
refreshToken (JWT, 7 days) ←── stored in MongoDB + sent by client to /refresh
      │
      ▼ (when accessToken expires)
POST /api/auth/refresh
  - old refreshToken verified against DB
  - old token DELETED (rotation)
  - new accessToken + refreshToken issued
      │
      ▼ (if old token is replayed after rotation)
ALL sessions wiped (reuse-attack detection)
```

### OTP flow

```
Register → isVerified: false
      │
      ▼
POST /send-otp  → 6-digit code bcrypt-hashed in DB, raw code emailed
      │
      ▼
POST /verify-email { code }
  - wrong code → attempts++
  - 5 wrong attempts → OTP deleted, must resend
  - correct code → isVerified: true, OTP deleted
      │
      ▼
POST /documents/upload now allowed
```

### Security measures

- Passwords hashed with **bcrypt** (12 salt rounds)
- OTP codes hashed with **bcrypt** — raw code never stored
- **Refresh token rotation** — each use issues a new token and revokes the old one
- **Reuse detection** — replaying a rotated token wipes all sessions
- **Rate limiting** — 200 req/15 min globally, 60 req/15 min on auth routes
- **Helmet** — sets 11 security-related HTTP headers
- **CORS** — configurable allowed origins via `ALLOWED_ORIGINS` env var
- `storagePath` never returned in API responses

---

## API Reference

### Base URL: `http://localhost:5000/api`

All protected routes require: `Authorization: Bearer <accessToken>`

All responses follow the shape:
```json
{ "success": true, "message": "...", "data": { ... } }
```

---

### Auth — `/api/auth`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/register` | No | Create account → returns token pair |
| POST | `/login` | No | Login → returns token pair |
| POST | `/refresh` | No | Rotate refresh token → new token pair |
| GET | `/me` | ✅ | Get current user profile |
| PATCH | `/me` | ✅ | Update name / avatar |
| PATCH | `/change-password` | ✅ | Change password, revokes all sessions |
| POST | `/logout` | ✅ | Revoke current refresh token |
| POST | `/logout-all` | ✅ | Revoke all sessions (all devices) |

### OTP — `/api/auth`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/send-otp` | ✅ | Send 6-digit code to user's email |
| POST | `/verify-email` | ✅ | Submit code → marks email verified |
| POST | `/resend-otp` | ✅ | Request new code (60s cooldown, max 3/hr) |

### Documents — `/api/documents`

| Method | Route | Auth | Verified | Description |
|--------|-------|------|----------|-------------|
| POST | `/upload` | ✅ | ✅ | Upload file → async AI processing |
| GET | `/` | ✅ | — | List documents (paginated) |
| GET | `/:id` | ✅ | — | Full document with topics + videos |
| GET | `/:id/status` | ✅ | — | Poll processing status |
| DELETE | `/:id` | ✅ | — | Delete document and file |
| GET | `/:id/topics/:i/videos/refresh` | ✅ | — | Re-fetch YouTube videos for a topic |

### Supported file types

`PDF` `DOCX` `PPTX` `TXT` `CSV` `JPG` `PNG` — max **20 MB**

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | `development` / `production` / `test` | `development` |
| `MONGO_URI` | MongoDB connection string | — |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens | — |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | — |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `AI_BASE_URL` | HuggingFace Space base URL | — |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key | — |
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | `true` for port 465, `false` for 587 | `false` |
| `SMTP_USER` | SMTP login email | — |
| `SMTP_PASS` | SMTP password or app password | — |
| `EMAIL_FROM_NAME` | Sender display name | `Awn App` |
| `MAX_FILE_SIZE_MB` | Max upload size in MB | `20` |
| `UPLOAD_DIR` | Directory for uploaded files | `uploads` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `*` |

> **Gmail tip:** Use an [App Password](https://support.google.com/accounts/answer/185833) — not your real password. Enable 2FA first, then generate an app password under Google Account → Security.

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB running locally (`mongod`) or a MongoDB Atlas URI

### Install and run

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — at minimum set MONGO_URI and both JWT secrets

# 3. Start development server (auto-restarts on changes)
npm run dev

# 4. Confirm it's working
curl http://localhost:5000/api/health
# → { "success": true, "message": "Awn API is running" }
```

### First request sequence

```
1. POST /api/auth/register       → save the accessToken and refreshToken
2. POST /api/auth/send-otp       → check server console for the 6-digit code
3. POST /api/auth/verify-email   → submit the code
4. POST /api/documents/upload    → attach a file, save the documentId
5. GET  /api/documents/:id/status → poll until status = "done"
6. GET  /api/documents/:id       → read topics, summaries, and videos
```

---

## Running Tests

Tests use an **in-memory MongoDB instance** — no real database needed.

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run only auth tests
npm run test:auth

# Run only document tests
npm run test:documents

# Watch mode (re-runs on file save)
npm run test:watch
```

The test suite covers:

- Register: success, duplicate email, validation errors, password hashing
- Login: success, wrong password, unknown email, deactivated account
- Refresh: token rotation, reuse-attack detection, deleted user
- Profile: get, update, change password
- OTP: send, verify, wrong code, brute-force lockout, resend cooldown, hourly limit
- Documents: upload guard (unverified), list with pagination, ownership checks, status polling, delete, video refresh
- JWT utils: sign, verify, expiry