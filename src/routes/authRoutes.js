const express = require("express");
const router = express.Router();

const {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  updateMe,
  changePassword,
} = require("../controllers/authController");

const { sendOtp, verifyEmail, resendOtp } = require("../controllers/otpController");

const { protect } = require("../middleware/auth");
const {
  validate,
  registerRules,
  loginRules,
  changePasswordRules,
} = require("../middleware/validators");

// ─── Public ───────────────────────────────────────────────
router.post("/register", registerRules, validate, register);
router.post("/login", loginRules, validate, login);
router.post("/refresh", refresh);

// ─── Protected ───────────────────────────────────────────
router.use(protect);

// Email verification (protected but pre-verification)
router.post("/send-otp", sendOtp);
router.post("/verify-email", verifyEmail);
router.post("/resend-otp", resendOtp);

router.get("/me", getMe);
router.patch("/me", updateMe);
router.patch("/change-password", changePasswordRules, validate, changePassword);
router.post("/logout", logout);
router.post("/logout-all", logoutAll);

module.exports = router;
