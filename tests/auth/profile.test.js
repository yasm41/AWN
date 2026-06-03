const request = require("supertest");
const app = require("../../src/app");
const db = require("../helpers/db");
const { createUser, DEFAULT_PASSWORD, authHeader } = require("../helpers/factories");

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/logout", () => {
// ══════════════════════════════════════════════════════════

  it("successfully logs out and revokes the refresh token → 200", async () => {
    const { accessToken, refreshToken } = await createUser();

    const res = await request(app)
      .post("/api/auth/logout")
      .set(authHeader(accessToken))
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("revoked token can no longer be used to refresh", async () => {
    const { accessToken, refreshToken } = await createUser();

    await request(app)
      .post("/api/auth/logout")
      .set(authHeader(accessToken))
      .send({ refreshToken });

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it("requires a valid access token → 401 without auth", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .send({ refreshToken: "sometoken" });

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
describe("POST /api/auth/logout-all", () => {
// ══════════════════════════════════════════════════════════

  it("revokes all refresh tokens for the user → 200", async () => {
    const User = require("../../src/models/User");
    const { accessToken, user } = await createUser();

    // Simulate 2 active sessions by adding another token
    await User.findByIdAndUpdate(user._id, {
      $push: {
        refreshTokens: {
          token: "second-device-token",
          deviceInfo: "device-2",
          expiresAt: new Date(Date.now() + 86400000),
        },
      },
    });

    const res = await request(app)
      .post("/api/auth/logout-all")
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.refreshTokens).toHaveLength(0);
  });

  it("requires authentication → 401", async () => {
    const res = await request(app).post("/api/auth/logout-all");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
describe("GET /api/auth/me", () => {
// ══════════════════════════════════════════════════════════

  it("returns the authenticated user's profile → 200", async () => {
    const { accessToken, user } = await createUser();

    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
    });
  });

  it("never returns password or refreshTokens → 200", async () => {
    const { accessToken } = await createUser();

    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(accessToken));

    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.refreshTokens).toBeUndefined();
  });

  it("rejects request without token → 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects expired/invalid token → 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set({ Authorization: "Bearer invalid.token.here" });

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
describe("PATCH /api/auth/me", () => {
// ══════════════════════════════════════════════════════════

  it("updates name successfully → 200", async () => {
    const { accessToken } = await createUser();

    const res = await request(app)
      .patch("/api/auth/me")
      .set(authHeader(accessToken))
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Updated Name");
  });

  it("updates avatar URL → 200", async () => {
    const { accessToken } = await createUser();

    const res = await request(app)
      .patch("/api/auth/me")
      .set(authHeader(accessToken))
      .send({ avatar: "https://example.com/avatar.jpg" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toBe("https://example.com/avatar.jpg");
  });

  it("does not require authentication → 401", async () => {
    const res = await request(app)
      .patch("/api/auth/me")
      .send({ name: "Hacker" });

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
describe("PATCH /api/auth/change-password", () => {
// ══════════════════════════════════════════════════════════

  it("changes password with correct current password → 200", async () => {
    const { accessToken } = await createUser();

    const res = await request(app)
      .patch("/api/auth/change-password")
      .set(authHeader(accessToken))
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: "NewPass456",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("revokes all refresh tokens after password change", async () => {
    const User = require("../../src/models/User");
    const { accessToken, user } = await createUser();

    await request(app)
      .patch("/api/auth/change-password")
      .set(authHeader(accessToken))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "NewPass456" });

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.refreshTokens).toHaveLength(0);
  });

  it("can log in with new password after change", async () => {
    const { accessToken } = await createUser();

    await request(app)
      .patch("/api/auth/change-password")
      .set(authHeader(accessToken))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "NewPass456" });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: DEFAULT_USER.email, password: "NewPass456" });

    expect(loginRes.status).toBe(200);
  });

  it("rejects wrong current password → 400", async () => {
    const { accessToken } = await createUser();

    const res = await request(app)
      .patch("/api/auth/change-password")
      .set(authHeader(accessToken))
      .send({ currentPassword: "WrongOld1", newPassword: "NewPass456" });

    expect(res.status).toBe(400);
  });

  it("rejects new password that fails strength rules → 422", async () => {
    const { accessToken } = await createUser();

    const res = await request(app)
      .patch("/api/auth/change-password")
      .set(authHeader(accessToken))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "weak" });

    expect(res.status).toBe(422);
  });

  it("requires authentication → 401", async () => {
    const res = await request(app)
      .patch("/api/auth/change-password")
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "NewPass456" });

    expect(res.status).toBe(401);
  });
});
