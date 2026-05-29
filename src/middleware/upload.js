const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { error } = require("../utils/response");

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "20", 10);

// ─── Allowed MIME types ───────────────────────────────────
const ALLOWED_MIMES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/csv": "csv",
  "image/jpeg": "image",
  "image/png": "image",
  "image/jpg": "image",
};

// ─── Storage: keep original extension, rename with UUID ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || "uploads");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// ─── Filter ───────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        `Unsupported file type: ${file.mimetype}`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

/**
 * Maps a MIME type string to the fileType enum used in the Document model
 */
const getMimeFileType = (mimetype) => ALLOWED_MIMES[mimetype] || "unknown";

/**
 * Express error handler for multer errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return error(res, `File too large. Max size is ${MAX_SIZE_MB}MB.`, 413);
    }
    return error(res, err.message, 400);
  }
  next(err);
};

module.exports = { upload, getMimeFileType, handleUploadError };
