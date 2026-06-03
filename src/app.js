const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { error } = require("./utils/response");

const app = express();

// ─── Security headers ─────────────────────────────────────
// app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ─── Body parsing ─────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging (only in non-test envs) ─────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// ─── Global rate limiter ──────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: "Too many requests, slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});
// app.use(globalLimiter);

// ─── Strict limiter for auth endpoints ───────────────────
// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 20,
//   message: { success: false, message: "Too many auth attempts, try again later." },
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// ─── Routes ───────────────────────────────────────────────
app.use("/api/auth"
  //  authLimiter, 
   , require("./routes/authRoutes"));
app.use("/api/documents", require("./routes/documentRoutes"));

// ─── Health check ─────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Awn API is running",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ─── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  return error(res, `Route ${req.originalUrl} not found`, 404);
});

// ─── Global error handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  return error(
    res,
    process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    err.status || 500
  );
});

module.exports = app;
