const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  refreshTokenExpiresAt,
} = require("../../src/utils/jwt");

// ─── Set required env vars for JWT ───────────────────────
beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access_secret_for_jest";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret_for_jest";
  process.env.JWT_ACCESS_EXPIRES_IN = "15m";
  process.env.JWT_REFRESH_EXPIRES_IN = "7";
});

// ══════════════════════════════════════════════════════════
describe("JWT Utilities", () => {
// ══════════════════════════════════════════════════════════

  const PAYLOAD = { id: "507f1f77bcf86cd799439011" };

  // ── signAccessToken ─────────────────────────────────────
  describe("signAccessToken", () => {

    it("returns a non-empty string", () => {
      const token = signAccessToken(PAYLOAD);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("produces a three-part JWT (header.payload.signature)", () => {
      const token = signAccessToken(PAYLOAD);
      expect(token.split(".")).toHaveLength(3);
    });
  });

  // ── signRefreshToken ────────────────────────────────────
  describe("signRefreshToken", () => {

    it("returns a non-empty string", () => {
      const token = signRefreshToken(PAYLOAD);
      expect(typeof token).toBe("string");
    });

    it("access and refresh tokens for same payload are different strings", () => {
      const access = signAccessToken(PAYLOAD);
      const refresh = signRefreshToken(PAYLOAD);
      expect(access).not.toBe(refresh);
    });
  });

  // ── verifyAccessToken ───────────────────────────────────
  describe("verifyAccessToken", () => {

    it("decodes a valid access token and returns the payload", () => {
      const token = signAccessToken(PAYLOAD);
      const decoded = verifyAccessToken(token);
      expect(decoded.id).toBe(PAYLOAD.id);
    });

    it("throws for a tampered access token", () => {
      const token = signAccessToken(PAYLOAD);
      const tampered = token.slice(0, -5) + "XXXXX";
      expect(() => verifyAccessToken(tampered)).toThrow();
    });

    it("throws when verifying a refresh token as an access token", () => {
      const refresh = signRefreshToken(PAYLOAD);
      expect(() => verifyAccessToken(refresh)).toThrow();
    });

    it("throws for an empty string", () => {
      expect(() => verifyAccessToken("")).toThrow();
    });

    it("throws for a completely random string", () => {
      expect(() => verifyAccessToken("not.a.token")).toThrow();
    });
  });

  // ── verifyRefreshToken ──────────────────────────────────
  describe("verifyRefreshToken", () => {

    it("decodes a valid refresh token and returns the payload", () => {
      const token = signRefreshToken(PAYLOAD);
      const decoded = verifyRefreshToken(token);
      expect(decoded.id).toBe(PAYLOAD.id);
    });

    it("throws for a tampered refresh token", () => {
      const token = signRefreshToken(PAYLOAD);
      const tampered = token.slice(0, -5) + "YYYYY";
      expect(() => verifyRefreshToken(tampered)).toThrow();
    });

    it("throws when verifying an access token as a refresh token", () => {
      const access = signAccessToken(PAYLOAD);
      expect(() => verifyRefreshToken(access)).toThrow();
    });
  });

  // ── refreshTokenExpiresAt ───────────────────────────────
  describe("refreshTokenExpiresAt", () => {

    it("returns a Date object", () => {
      const date = refreshTokenExpiresAt();
      expect(date instanceof Date).toBe(true);
    });

    it("returns a date in the future", () => {
      const date = refreshTokenExpiresAt();
      expect(date.getTime()).toBeGreaterThan(Date.now());
    });

    it("returns a date approximately 7 days from now", () => {
      const date = refreshTokenExpiresAt();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const diff = date.getTime() - Date.now();
      // Allow 5 second window for test execution time
      expect(diff).toBeGreaterThan(sevenDaysMs - 5000);
      expect(diff).toBeLessThan(sevenDaysMs + 5000);
    });
  });
});
