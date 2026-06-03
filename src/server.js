require("dotenv").config();
const fs = require("fs");
const path = require("path");

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

// ─── Ensure upload directory exists ──────────────────────
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Created upload directory: ${uploadDir}`);
}

// ─── Connect to MongoDB, then start server ────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Awn API running on port ${PORT}`);
    console.log(`   ENV  : ${process.env.NODE_ENV || "development"}`);
    console.log(`   Docs : http://localhost:${PORT}/api/health\n`);
  });
});
