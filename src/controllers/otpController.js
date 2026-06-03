const crypto = require("crypto");
const Otp = require("../models/Otp");
const User = require("../models/User");
const { sendOtpEmail } = require("../services/emailService");
const { success, error } = require("../utils/response");

// ─── Config constants ─────────────────────────────────────
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;          // wrong guesses before OTP is invalidated
const MAX_RESENDS_PER_HOUR = 3;  // max resend requests in 60-min window
const RESEND_COOLDOWN_SECONDS = 60; // minimum gap between resends

/**
 * Generate a cryptographically random 6-digit numeric string.
 */
const generateOtpCode = () => {
  // Use crypto.randomInt for uniform distribution with no modulo bias
  return String(crypto.randomInt(100000, 999999));
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/send-otp
// @access  Private (logged-in, unverified user)
// ══════════════════════════════════════════════════════════
const sendOtp = async (req, res) => {
  try {
    const user = req.user;

    if (user.isVerified) {
      return error(res, "Email is already verified", 400);
    }

    // ── Delete any existing OTP for this user ─────────────
    await Otp.deleteMany({ user: user._id });

    const rawCode = generateOtpCode();
    const codeHash = await Otp.hashCode(rawCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Otp.create({
      user: user._id,
      email: user.email,
      codeHash,
      expiresAt,
    });

    await sendOtpEmail(user.email, user.name, rawCode);

    return success(
      res,
      { expiresInMinutes: OTP_EXPIRY_MINUTES },
      `Verification code sent to ${user.email}`
    );
  } catch (err) {
    console.error("sendOtp error:", err);
    return error(res, "Failed to send verification code", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/verify-email
// @access  Private (logged-in, unverified user)
// Body:    { code: "123456" }
// ══════════════════════════════════════════════════════════
const verifyEmail = async (req, res) => {
  try {
    const { code } = req.body;
    const user = req.user;

    if (!code) {
      return error(res, "Verification code is required", 400);
    }

    if (user.isVerified) {
      return error(res, "Email is already verified", 400);
    }

    // Find the OTP record (select codeHash explicitly — it's hidden by default)
    const otpRecord = await Otp.findOne({ user: user._id }).select("+codeHash");

    if (!otpRecord) {
      return error(
        res,
        "No verification code found. Please request a new one.",
        404
      );
    }

    // ── Expired check (belt-and-suspenders on top of TTL index) ──
    if (otpRecord.expiresAt < new Date()) {
      await otpRecord.deleteOne();
      return error(res, "Verification code has expired. Please request a new one.", 410);
    }

    // ── Brute-force guard ─────────────────────────────────
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      await otpRecord.deleteOne();
      return error(
        res,
        "Too many incorrect attempts. Please request a new verification code.",
        429
      );
    }

    // ── Verify code ───────────────────────────────────────
    const isMatch = await otpRecord.verifyCode(String(code).trim());

    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      const attemptsLeft = MAX_ATTEMPTS - otpRecord.attempts;
      return error(
        res,
        `Incorrect code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`,
        400
      );
    }

    // ── Success: mark user verified and delete OTP ────────
    user.isVerified = true;
    await user.save({ validateBeforeSave: false });
    await otpRecord.deleteOne();

    return success(res, { user }, "Email verified successfully");
  } catch (err) {
    console.error("verifyEmail error:", err);
    return error(res, "Email verification failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/resend-otp
// @access  Private (logged-in, unverified user)
// ══════════════════════════════════════════════════════════
const resendOtp = async (req, res) => {
  try {
    const user = req.user;

    if (user.isVerified) {
      return error(res, "Email is already verified", 400);
    }

    const existingOtp = await Otp.findOne({ user: user._id });

    if (existingOtp) {
      // ── Cooldown check ─────────────────────────────────
      if (existingOtp.lastResendAt) {
        const secondsSinceLastResend =
          (Date.now() - existingOtp.lastResendAt.getTime()) / 1000;

        if (secondsSinceLastResend < RESEND_COOLDOWN_SECONDS) {
          const waitSeconds = Math.ceil(
            RESEND_COOLDOWN_SECONDS - secondsSinceLastResend
          );
          return error(
            res,
            `Please wait ${waitSeconds} second${waitSeconds !== 1 ? "s" : ""} before requesting another code.`,
            429
          );
        }
      }

      // ── Hourly resend limit ────────────────────────────
      if (existingOtp.resendCount >= MAX_RESENDS_PER_HOUR) {
        return error(
          res,
          "Maximum resend limit reached. Please wait before requesting a new code.",
          429
        );
      }
    }

    // ── Delete old OTP and issue a fresh one ──────────────
    await Otp.deleteMany({ user: user._id });

    const rawCode = generateOtpCode();
    const codeHash = await Otp.hashCode(rawCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const resendCount = existingOtp ? existingOtp.resendCount + 1 : 1;

    await Otp.create({
      user: user._id,
      email: user.email,
      codeHash,
      expiresAt,
      resendCount,
      lastResendAt: new Date(),
    });

    await sendOtpEmail(user.email, user.name, rawCode);

    return success(
      res,
      {
        expiresInMinutes: OTP_EXPIRY_MINUTES,
        resendsRemaining: MAX_RESENDS_PER_HOUR - resendCount,
      },
      `New verification code sent to ${user.email}`
    );
  } catch (err) {
    console.error("resendOtp error:", err);
    return error(res, "Failed to resend verification code", 500);
  }
};

module.exports = { sendOtp, verifyEmail, resendOtp };
