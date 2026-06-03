const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const otpSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  // We store a bcrypt hash — never the raw code
  codeHash: {
    type: String,
    required: true,
    select: false,
  },
  expiresAt: {
    type: Date,
    required: true,
    // MongoDB TTL index — auto-deletes expired documents
    index: { expireAfterSeconds: 0 },
  },
  // How many times the user has tried a wrong code (brute-force guard)
  attempts: {
    type: Number,
    default: 0,
  },
  // Tracks resend requests in the current window
  resendCount: {
    type: Number,
    default: 0,
  },
  lastResendAt: {
    type: Date,
    default: null,
  },
});

// ─── Hash a raw OTP code before storing ──────────────────
otpSchema.statics.hashCode = async (rawCode) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(rawCode, salt);
};

// ─── Compare a candidate code against the stored hash ────
otpSchema.methods.verifyCode = async function (candidateCode) {
  return bcrypt.compare(candidateCode, this.codeHash);
};

module.exports = mongoose.model("Otp", otpSchema);
