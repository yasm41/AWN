const request = require("supertest");
const app = require("../../src/app");
const db = require("../helpers/db");
const { createUser, DEFAULT_USER, DEFAULT_PASSWORD } = require("../helpers/factories");

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/login", () => {
// ══════════════════════════════════════════════════════════

  const ENDPOINT = "/api/auth/login";

  describe("✅ Success cases", () => {

    it("logs in with correct credentials → 200 + tokens", async () => {
      await createUser();

      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email, password: DEFAULT_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        user: { email: DEFAULT_USER.email },
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("returns a valid JWT access token", async () => {
      await createUser();
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email, password: DEFAULT_PASSWORD });

      const { verifyAccessToken } = require("../../src/utils/jwt");
      const decoded = verifyAccessToken(res.body.data.accessToken);
      expect(decoded.id).toBeDefined();
    });

    it("stores the refresh token in the user document", async () => {
      await createUser();
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email, password: DEFAULT_PASSWORD });

      const User = require("../../src/models/User");
      const user = await User.findOne({ email: DEFAULT_USER.email });
      const stored = user.refreshTokens.find(
        (t) => t.token === res.body.data.refreshToken
      );
      expect(stored).toBeDefined();
    });

    it("never returns password or refreshTokens array", async () => {
      await createUser();
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email, password: DEFAULT_PASSWORD });

      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.refreshTokens).toBeUndefined();
    });
  });

  describe("❌ Wrong credentials", () => {

    it("rejects wrong password → 401", async () => {
      await createUser();
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email, password: "WrongPass1" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects unregistered email → 401", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: "nobody@awn.com", password: DEFAULT_PASSWORD });

      expect(res.status).toBe(401);
    });

    it("returns same generic error for wrong email vs wrong password (no enumeration)", async () => {
      await createUser();

      const wrongEmail = await request(app)
        .post(ENDPOINT)
        .send({ email: "nobody@awn.com", password: DEFAULT_PASSWORD });

      const wrongPass = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email, password: "WrongPass1" });

      // Both return the same message — prevents user enumeration
      expect(wrongEmail.body.message).toBe(wrongPass.body.message);
    });
  });

  describe("❌ Validation errors", () => {

    it("rejects missing email → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ password: DEFAULT_PASSWORD });

      expect(res.status).toBe(422);
    });

    it("rejects missing password → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email });

      expect(res.status).toBe(422);
    });

    it("rejects invalid email format → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: "not-email", password: DEFAULT_PASSWORD });

      expect(res.status).toBe(422);
    });
  });

  describe("❌ Deactivated account", () => {

    it("returns 403 for a deactivated user", async () => {
      const User = require("../../src/models/User");
      await createUser();
      await User.findOneAndUpdate(
        { email: DEFAULT_USER.email },
        { isActive: false }
      );

      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: DEFAULT_USER.email, password: DEFAULT_PASSWORD });

      expect(res.status).toBe(403);
    });
  });
});
