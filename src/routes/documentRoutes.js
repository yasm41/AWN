const express = require("express");
const router = express.Router();

const {
  uploadDocument,
  listDocuments,
  getDocument,
  getDocumentStatus,
  deleteDocument,
  refreshTopicVideos,
} = require("../controllers/documentController");

const { protect } = require("../middleware/auth");
const { upload, handleUploadError } = require("../middleware/upload");

// All document routes require authentication
router.use(protect);

// ─── Upload ───────────────────────────────────────────────
router.post(
  "/upload",
  upload.single("file"),
  handleUploadError,
  uploadDocument
);

// ─── List / Query ─────────────────────────────────────────
router.get("/", listDocuments);

// ─── Single document ──────────────────────────────────────
router.get("/:id", getDocument);
router.get("/:id/status", getDocumentStatus);
router.delete("/:id", deleteDocument);

// ─── Topic actions ────────────────────────────────────────
router.get("/:id/topics/:topicIndex/videos/refresh", refreshTopicVideos);

module.exports = router;
