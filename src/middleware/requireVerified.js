const { error } = require("../utils/response");

/**
 * requireVerified middleware
 *
 * Must be used AFTER the `protect` middleware (which populates req.user).
 * Blocks the request with 403 if the user's email has not been verified.
 *
 * Usage:
 *   router.post("/upload", protect, requireVerified, upload.single("file"), uploadDocument);
 */
const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return error(
      res,
      "Please verify your email address before uploading documents.",
      403
    );
  }
  next();
};

module.exports = { requireVerified };
