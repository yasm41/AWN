const request = require("supertest");
const app = require("../../src/app");
const db = require("../helpers/db");
const { createUser } = require("../helpers/factories");

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/refresh", () => {
// ══════════════════════════════════════════════════════════

  const ENDPOINT = "/api/auth/refresh";

  describe("✅ Success cases", () => {

    it("exchanges a valid refresh token for a new token pair → 200", async () => {
      const { refreshToken } = await createUser();

      const res = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("issues a NEW refresh token (rotation — not the same one)", async () => {
      const { refreshToken } = await createUser();

      const res = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken });

      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it("revokes the OLD refresh token after rotation", async () => {
      const { refreshToken } = await createUser();

      // Rotate once
      await request(app).post(ENDPOINT).send({ refreshToken });

      // Try to reuse the old token — must fail
      const res = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken });

      expect(res.status).toBe(401);
    });

    it("new access token is a valid JWT", async () => {
      const { refreshToken } = await createUser();

      const res = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken });

      const { verifyAccessToken } = require("../../src/utils/jwt");
      const decoded = verifyAccessToken(res.body.data.accessToken);
      expect(decoded.id).toBeDefined();
    });
  });

  describe("❌ Token reuse attack", () => {

    it("revokes ALL sessions when a rotated token is reused", async () => {
      const { refreshToken } = await createUser();

      // Rotate once — get new token
      const rotateRes = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken });

      const newRefreshToken = rotateRes.body.data.refreshToken;

      // Replay the OLD token (simulated theft)
      await request(app)
        .post(ENDPOINT)
        .send({ refreshToken }); // old rotated token

      // The NEW token should also be revoked now
      const reuseRes = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken: newRefreshToken });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.message).toMatch(/revoked/i);
    });
  });

  describe("❌ Invalid token cases", () => {

    it("rejects missing refreshToken body → 400", async () => {
      const res = await request(app).post(ENDPOINT).send({});
      expect(res.status).toBe(400);
    });

    it("rejects a completely invalid token string → 401", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken: "not.a.real.token" });

      expect(res.status).toBe(401);
    });

    it("rejects a token for a deleted user → 401", async () => {
      const User = require("../../src/models/User");
      const { refreshToken, user } = await createUser();

      await User.findByIdAndDelete(user._id);

      const res = await request(app)
        .post(ENDPOINT)
        .send({ refreshToken });

      expect(res.status).toBe(401);
    });
  });
});
