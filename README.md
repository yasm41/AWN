# Awn Backend API

Node.js + MongoDB backend for the **Awn** educational assistant app.

---

## Tech Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Runtime      | Node.js (Express)                   |
| Database     | MongoDB (Mongoose)                  |
| Auth         | JWT Access + Refresh tokens (DB)    |
| File Upload  | Multer                              |
| AI Service   | HuggingFace Space (Gradio)          |
| YouTube      | YouTube Data API v3                 |

---

## Project Structure

```
src/
├── config/
│   └── db.js                  MongoDB connection
├── controllers/
│   ├── authController.js      Register, login, refresh, logout, profile
│   └── documentController.js  Upload, process, list, get, delete
├── middleware/
│   ├── auth.js                JWT protect middleware
│   ├── upload.js              Multer config + error handler
│   └── validators.js          express-validator rules
├── models/
│   ├── User.js                User schema + refresh token array
│   └── Document.js            Document + topics + videos schema
├── routes/
│   ├── authRoutes.js
│   └── documentRoutes.js
├── services/
│   ├── aiService.js           HuggingFace Gradio integration
│   └── youtubeService.js      YouTube Data API v3
├── utils/
│   ├── jwt.js                 Sign/verify access + refresh tokens
│   └── response.js            Consistent API response helpers
├── app.js                     Express app setup
└── server.js                  Entry point
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Run
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

---

## Environment Variables

| Variable               | Description                              | Default     |
|------------------------|------------------------------------------|-------------|
| `PORT`                 | Server port                              | `5000`      |
| `NODE_ENV`             | Environment                              | `development` |
| `MONGO_URI`            | MongoDB connection string                | —           |
| `JWT_ACCESS_SECRET`    | Secret for access tokens                 | —           |
| `JWT_REFRESH_SECRET`   | Secret for refresh tokens                | —           |
| `JWT_ACCESS_EXPIRES_IN`| Access token TTL                         | `15m`       |
| `JWT_REFRESH_EXPIRES_IN`| Refresh token TTL                       | `7d`        |
| `AI_BASE_URL`          | HuggingFace Space base URL               | —           |
| `YOUTUBE_API_KEY`      | YouTube Data API v3 key                  | —           |
| `MAX_FILE_SIZE_MB`     | Max upload size                          | `20`        |
| `UPLOAD_DIR`           | Local upload path                        | `uploads`   |
| `ALLOWED_ORIGINS`      | Comma-separated CORS origins             | `*`         |

---

## API Reference

### Base URL: `/api`

---

### 🔐 Auth — `/api/auth`

#### `POST /register`
Register a new user.

**Body:**
```json
{
  "name": "Ahmed",
  "email": "ahmed@example.com",
  "password": "Secret123"
}
```
**Response `201`:**
```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "name": "Ahmed", "email": "..." },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

#### `POST /login`
**Body:**
```json
{ "email": "ahmed@example.com", "password": "Secret123" }
```
**Response `200`:** Same shape as `/register`.

---

#### `POST /refresh`
Exchange a refresh token for a new token pair (rotation).

**Body:**
```json
{ "refreshToken": "eyJ..." }
```
**Response `200`:**
```json
{
  "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." }
}
```

---

#### `POST /logout` 🔒
Revoke the current refresh token.

**Headers:** `Authorization: Bearer <accessToken>`

**Body:**
```json
{ "refreshToken": "eyJ..." }
```

---

#### `POST /logout-all` 🔒
Revoke all refresh tokens (all devices).

---

#### `GET /me` 🔒
Get current user profile.

---

#### `PATCH /me` 🔒
Update name or avatar URL.

**Body:**
```json
{ "name": "New Name", "avatar": "https://..." }
```

---

#### `PATCH /change-password` 🔒
**Body:**
```json
{ "currentPassword": "Old123", "newPassword": "New456A" }
```
> Revokes all existing refresh tokens on success.

---

### 📄 Documents — `/api/documents`
> All routes require `Authorization: Bearer <accessToken>`

---

#### `POST /upload`
Upload a file for AI processing.

**Form-data:**
- `file` — PDF, DOCX, PPTX, TXT, CSV, JPG, PNG (max 20MB)

**Response `202`** (processing starts asynchronously):
```json
{
  "data": {
    "document": {
      "_id": "...",
      "originalName": "lecture.pdf",
      "fileType": "pdf",
      "status": "pending"
    }
  }
}
```

---

#### `GET /:id/status`
Poll processing status.

**Response:**
```json
{ "data": { "status": "done" } }
```
Possible statuses: `pending` → `processing` → `done` | `failed`

---

#### `GET /`
List all user documents (paginated).

**Query params:** `page`, `limit`, `status`

---

#### `GET /:id`
Get full document with topics, summaries, and videos.

**Response:**
```json
{
  "data": {
    "document": {
      "_id": "...",
      "status": "done",
      "topics": [
        {
          "title": "Image Segmentation",
          "summary": "Image segmentation is the process of...",
          "videos": [
            {
              "title": "Image Segmentation Explained",
              "channel": "3Blue1Brown",
              "link": "https://www.youtube.com/watch?v=...",
              "thumbnail": "https://i.ytimg.com/vi/.../hqdefault.jpg",
              "videoId": "..."
            }
          ]
        }
      ]
    }
  }
}
```

---

#### `DELETE /:id`
Delete a document and its file from disk.

---

#### `GET /:id/topics/:topicIndex/videos/refresh`
Re-fetch YouTube videos for a specific topic.

---

## Authentication Flow

```
Client                          Server
  │                               │
  ├─── POST /register ───────────►│  Returns accessToken + refreshToken
  │                               │
  ├─── GET /api/documents ───────►│  (with Authorization: Bearer accessToken)
  │                               │
  │   [15 min later — 401] ───────┤
  │                               │
  ├─── POST /refresh ────────────►│  Send refreshToken → get new pair
  │                               │  (old refresh token is REVOKED)
  │                               │
  ├─── POST /logout ─────────────►│  Revokes refresh token
```

## Supported File Types

| Extension | MIME Type                  |
|-----------|----------------------------|
| `.pdf`    | application/pdf            |
| `.docx`   | application/vnd.openxml... |
| `.pptx`   | application/vnd.openxml... |
| `.txt`    | text/plain                 |
| `.csv`    | text/csv                   |
| `.jpg`    | image/jpeg                 |
| `.png`    | image/png                  |
