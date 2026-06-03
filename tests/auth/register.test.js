const request = require("supertest");
const app = require("../../src/app");
const db = require("../helpers/db");
const { createUser, DEFAULT_USER, DEFAULT_PASSWORD } = require("../helpers/factories");

// ─── Setup / Teardown ─────────────────────────────────────
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/register", () => {
// ══════════════════════════════════════════════════════════

  const ENDPOINT = "/api/auth/register";

  // ── Happy path ─────────────────────────────────────────
  describe("✅ Success cases", () => {

    it("registers a new user and returns 201 with tokens", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send(DEFAULT_USER);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        user: {
          name: DEFAULT_USER.name,
          email: DEFAULT_USER.email,
        },
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it("never exposes the password in the response", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send(DEFAULT_USER);

      expect(res.body.data.user.password).toBeUndefined();
    });

    it("never exposes refresh tokens array in the response", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send(DEFAULT_USER);

      expect(res.body.data.user.refreshTokens).toBeUndefined();
    });

    it("stores a hashed password (not plaintext) in MongoDB", async () => {
      await request(app).post(ENDPOINT).send(DEFAULT_USER);

      const User = require("../../src/models/User");
      const user = await User.findOne({ email: DEFAULT_USER.email }).select("+password");
      expect(user.password).toBeDefined();
      expect(user.password).not.toBe(DEFAULT_PASSWORD);
      expect(user.password.startsWith("$2")).toBe(true); // bcrypt hash
    });
  });

  // ── Validation failures ─────────────────────────────────
  describe("❌ Validation errors", () => {

    it("rejects missing name → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ email: "a@b.com", password: "Password1" });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("rejects invalid email format → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ name: "Ahmed", email: "not-an-email", password: "Password1" });

      expect(res.status).toBe(422);
    });

    it("rejects password shorter than 8 chars → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ name: "Ahmed", email: "a@b.com", password: "Ab1" });

      expect(res.status).toBe(422);
    });

    it("rejects password without uppercase letter → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ name: "Ahmed", email: "a@b.com", password: "alllower1" });

      expect(res.status).toBe(422);
    });

    it("rejects password without a number → 422", async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .send({ name: "Ahmed", email: "a@b.com", password: "NoNumbers" });

      expect(res.status).toBe(422);
    });

    it("rejects empty body → 422", async () => {
      const res = await request(app).post(ENDPOINT).send({});
      expect(res.status).toBe(422);
    });
  });

  // ── Duplicate email ─────────────────────────────────────
  describe("❌ Duplicate email", () => {

    it("returns 409 when email is already registered", async () => {
      await createUser();

      const res = await request(app)
        .post(ENDPOINT)
        .send(DEFAULT_USER);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already registered/i);
    });

    it("is case-insensitive for duplicate email check", async () => {
      await createUser({ email: "test@awn.com" });

      const res = await request(app)
        .post(ENDPOINT)
        .send({ ...DEFAULT_USER, email: "TEST@AWN.COM" });

      // Should still be rejected (email is normalized to lowercase)
      expect(res.status).toBe(409);
    });
  });
});
