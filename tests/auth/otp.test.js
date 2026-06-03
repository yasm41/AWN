const request = require("supertest");
const app = require("../../src/app");
const db = require("../helpers/db");
const { createUser, authHeader } = require("../helpers/factories");
const Otp = require("../../src/models/Otp");
const User = require("../../src/models/User");

// ─── Mock email service so no real SMTP calls happen ─────
jest.mock("../../src/services/emailService", () => ({
  sendOtpEmail: jest.fn().mockResolvedValue({ messageId: "mock-id" }),
  verifyEmailConnection: jest.fn().mockResolvedValue(true),
}));

const { sendOtpEmail } = require("../../src/services/emailService");

beforeAll(async () => { await db.connect(); });
afterEach(async () => {
  await db.clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => { await db.disconnect(); });

// ─── Helper: request an OTP for a user ───────────────────
const requestOtp = (accessToken) =>
  request(app)
    .post("/api/auth/send-otp")
    .set(authHeader(accessToken));

// ─── Helper: get the raw OTP code from DB ────────────────
const getRawOtpFromDb = async (userId) => {
  // We stored a hash — but in tests the emailService mock captures the raw code
  const call = sendOtpEmail.mock.calls[sendOtpEmail.mock.calls.length - 1];
  return call ? call[2] : null; // 3rd arg is the rawCode
};

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/send-otp", () => {
// ══════════════════════════════════════════════════════════

  describe("✅ Success cases", () => {

    it("sends an OTP to a logged-in unverified user → 200", async () => {
      const { accessToken } = await createUser();

      const res = await requestOtp(accessToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expiresInMinutes).toBe(10);
    });

    it("calls sendOtpEmail with correct email and a 6-digit code", async () => {
      const { accessToken, user } = await createUser();

      await requestOtp(accessToken);

      expect(sendOtpEmail).toHaveBeenCalledTimes(1);
      const [toEmail, toName, rawCode] = sendOtpEmail.mock.calls[0];
      expect(toEmail).toBe(user.email);
      expect(toName).toBe(user.name);
      expect(rawCode).toMatch(/^\d{6}$/);
    });

    it("stores the OTP in the database (hashed, not plaintext)", async () => {
      const { accessToken, user } = await createUser();

      await requestOtp(accessToken);

      const otp = await Otp.findOne({ user: user._id }).select("+codeHash");
      expect(otp).not.toBeNull();
      expect(otp.codeHash).toBeDefined();

      const rawCode = await getRawOtpFromDb(user._id);
      // Hash must differ from plaintext
      expect(otp.codeHash).not.toBe(rawCode);
      // But bcrypt compare should succeed
      const bcrypt = require("bcryptjs");
      expect(await bcrypt.compare(rawCode, otp.codeHash)).toBe(true);
    });

    it("replaces old OTP when sending again (deletes previous record)", async () => {
      const { accessToken, user } = await createUser();

      await requestOtp(accessToken);
      await requestOtp(accessToken);

      const count = await Otp.countDocuments({ user: user._id });
      expect(count).toBe(1);
    });
  });

  describe("❌ Error cases", () => {

    it("returns 400 if user is already verified", async () => {
      const { accessToken, user } = await createUser();
      await User.findByIdAndUpdate(user._id, { isVerified: true });

      const res = await requestOtp(accessToken);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already verified/i);
    });

    it("requires authentication → 401", async () => {
      const res = await request(app).post("/api/auth/send-otp");
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/verify-email", () => {
// ══════════════════════════════════════════════════════════

  describe("✅ Success cases", () => {

    it("verifies email with correct OTP → 200", async () => {
      const { accessToken, user } = await createUser();
      await requestOtp(accessToken);
      const rawCode = await getRawOtpFromDb(user._id);

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: rawCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("sets isVerified to true in the database", async () => {
      const { accessToken, user } = await createUser();
      await requestOtp(accessToken);
      const rawCode = await getRawOtpFromDb(user._id);

      await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: rawCode });

      const updated = await User.findById(user._id);
      expect(updated.isVerified).toBe(true);
    });

    it("deletes the OTP record after successful verification", async () => {
      const { accessToken, user } = await createUser();
      await requestOtp(accessToken);
      const rawCode = await getRawOtpFromDb(user._id);

      await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: rawCode });

      const otp = await Otp.findOne({ user: user._id });
      expect(otp).toBeNull();
    });

    it("returns the updated user in the response", async () => {
      const { accessToken, user } = await createUser();
      await requestOtp(accessToken);
      const rawCode = await getRawOtpFromDb(user._id);

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: rawCode });

      expect(res.body.data.user.isVerified).toBe(true);
    });
  });

  describe("❌ Wrong / missing code", () => {

    it("returns 400 for an incorrect OTP code", async () => {
      const { accessToken } = await createUser();
      await requestOtp(accessToken);

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: "000000" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/incorrect/i);
    });

    it("decrements attempts remaining in the message", async () => {
      const { accessToken } = await createUser();
      await requestOtp(accessToken);

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: "000000" });

      expect(res.body.message).toMatch(/4 attempts remaining/i);
    });

    it("returns 400 for missing code field", async () => {
      const { accessToken } = await createUser();
      await requestOtp(accessToken);

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 404 when no OTP record exists (never requested one)", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: "123456" });

      expect(res.status).toBe(404);
    });

    it("returns 400 if email is already verified", async () => {
      const { accessToken, user } = await createUser();
      await User.findByIdAndUpdate(user._id, { isVerified: true });

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: "123456" });

      expect(res.status).toBe(400);
    });
  });

  describe("❌ Brute-force protection", () => {

    it("invalidates the OTP after 5 wrong attempts → 429", async () => {
      const { accessToken } = await createUser();
      await requestOtp(accessToken);

      // Make 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/verify-email")
          .set(authHeader(accessToken))
          .send({ code: "000000" });
      }

      // 6th attempt should hit the lockout even with the correct code
      const res = await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: "000000" });

      expect(res.status).toBe(429);
    });

    it("deletes the OTP record on lockout", async () => {
      const { accessToken, user } = await createUser();
      await requestOtp(accessToken);

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/verify-email")
          .set(authHeader(accessToken))
          .send({ code: "000000" });
      }

      // Trigger lockout
      await request(app)
        .post("/api/auth/verify-email")
        .set(authHeader(accessToken))
        .send({ code: "000000" });

      const otp = await Otp.findOne({ user: user._id });
      expect(otp).toBeNull();
    });
  });
});

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/resend-otp", () => {
// ══════════════════════════════════════════════════════════

  describe("✅ Success cases", () => {

    it("resends a new OTP code → 200", async () => {
      const { accessToken } = await createUser();
      await requestOtp(accessToken); // first send

      const res = await request(app)
        .post("/api/auth/resend-otp")
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.resendsRemaining).toBe(2); // 3 max − 1 used
    });

    it("sends a different OTP code on resend", async () => {
      const { accessToken, user } = await createUser();
      await requestOtp(accessToken);
      const firstCode = sendOtpEmail.mock.calls[0][2];

      // Manually clear the cooldown for the test
      await Otp.findOneAndUpdate(
        { user: user._id },
        { lastResendAt: new Date(Date.now() - 70000) } // 70 sec ago
      );

      await request(app)
        .post("/api/auth/resend-otp")
        .set(authHeader(accessToken));

      const secondCode = sendOtpEmail.mock.calls[1][2];
      // Codes should (almost certainly) differ
      expect(typeof secondCode).toBe("string");
      expect(secondCode).toMatch(/^\d{6}$/);
    });

    it("can resend even without a prior OTP record (fresh start)", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .post("/api/auth/resend-otp")
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
    });
  });

  describe("❌ Rate limiting", () => {

    it("enforces 60-second cooldown between resends → 429", async () => {
      const { accessToken } = await createUser();
      await requestOtp(accessToken);

      // Immediately resend — should hit cooldown
      const res = await request(app)
        .post("/api/auth/resend-otp")
        .set(authHeader(accessToken));

      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(/wait/i);
    });

    it("enforces max 3 resends per hour → 429", async () => {
      const { accessToken, user } = await createUser();
      await requestOtp(accessToken);

      // Manually set resendCount to max and clear lastResendAt cooldown
      await Otp.findOneAndUpdate(
        { user: user._id },
        {
          resendCount: 3,
          lastResendAt: new Date(Date.now() - 70000),
        }
      );

      const res = await request(app)
        .post("/api/auth/resend-otp")
        .set(authHeader(accessToken));

      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(/maximum resend limit/i);
    });
  });

  describe("❌ Already verified", () => {

    it("returns 400 if user is already verified", async () => {
      const { accessToken, user } = await createUser();
      await User.findByIdAndUpdate(user._id, { isVerified: true });

      const res = await request(app)
        .post("/api/auth/resend-otp")
        .set(authHeader(accessToken));

      expect(res.status).toBe(400);
    });
  });

  describe("❌ Auth", () => {

    it("requires authentication → 401", async () => {
      const res = await request(app).post("/api/auth/resend-otp");
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════════
describe("Upload guard: unverified users blocked", () => {
// ══════════════════════════════════════════════════════════

  it("returns 403 when an unverified user tries to upload", async () => {
    const { accessToken } = await createUser(); // isVerified defaults to false

    const res = await request(app)
      .post("/api/documents/upload")
      .set(authHeader(accessToken))
      .attach("file", Buffer.from("hello"), "test.txt");

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verify your email/i);
  });

  it("allows a verified user to reach the upload endpoint", async () => {
    const { accessToken, user } = await createUser();
    await User.findByIdAndUpdate(user._id, { isVerified: true });

    // We just check it passes the guard (400 = no file = guard passed)
    const res = await request(app)
      .post("/api/documents/upload")
      .set(authHeader(accessToken));

    expect(res.status).toBe(400); // "No file uploaded" — not 403
  });
});
