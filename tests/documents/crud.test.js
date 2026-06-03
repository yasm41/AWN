const request = require("supertest");
const app = require("../../src/app");
const db = require("../helpers/db");
const {
  createUser,
  createOtherUser,
  createDocument,
  authHeader,
} = require("../helpers/factories");

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

// ══════════════════════════════════════════════════════════
describe("GET /api/documents", () => {
// ══════════════════════════════════════════════════════════

  describe("✅ Success cases", () => {

    it("returns an empty list when user has no documents → 200", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .get("/api/documents")
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(0);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it("returns only the authenticated user's documents", async () => {
      const { accessToken, user } = await createUser();
      const { user: otherUser } = await createOtherUser();

      // Create 2 docs for our user, 1 for the other
      await createDocument(user._id);
      await createDocument(user._id);
      await createDocument(otherUser._id);

      const res = await request(app)
        .get("/api/documents")
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(2);
    });

    it("returns correct pagination metadata", async () => {
      const { accessToken, user } = await createUser();

      // Create 3 documents
      await Promise.all([
        createDocument(user._id),
        createDocument(user._id),
        createDocument(user._id),
      ]);

      const res = await request(app)
        .get("/api/documents?page=1&limit=2")
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(2);
      expect(res.body.data.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it("filters documents by status query param", async () => {
      const { accessToken, user } = await createUser();

      await createDocument(user._id, { status: "done" });
      await createDocument(user._id, { status: "failed" });
      await createDocument(user._id, { status: "processing" });

      const res = await request(app)
        .get("/api/documents?status=done")
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(1);
      expect(res.body.data.documents[0].status).toBe("done");
    });

    it("returns documents sorted newest first", async () => {
      const { accessToken, user } = await createUser();

      const doc1 = await createDocument(user._id, { originalName: "first.pdf" });
      await new Promise((r) => setTimeout(r, 10));
      const doc2 = await createDocument(user._id, { originalName: "second.pdf" });

      const res = await request(app)
        .get("/api/documents")
        .set(authHeader(accessToken));

      expect(res.body.data.documents[0].originalName).toBe("second.pdf");
      expect(res.body.data.documents[1].originalName).toBe("first.pdf");
    });

    it("does NOT include topics in list view (performance)", async () => {
      const { accessToken, user } = await createUser();
      await createDocument(user._id);

      const res = await request(app)
        .get("/api/documents")
        .set(authHeader(accessToken));

      expect(res.body.data.documents[0].topics).toBeUndefined();
    });
  });

  describe("❌ Auth", () => {
    it("requires authentication → 401", async () => {
      const res = await request(app).get("/api/documents");
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════════
describe("GET /api/documents/:id", () => {
// ══════════════════════════════════════════════════════════

  describe("✅ Success cases", () => {

    it("returns a full document with topics and videos → 200", async () => {
      const { accessToken, user } = await createUser();
      const doc = await createDocument(user._id);

      const res = await request(app)
        .get(`/api/documents/${doc._id}`)
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.document).toMatchObject({
        _id: doc._id.toString(),
        originalName: doc.originalName,
        status: "done",
      });
      expect(res.body.data.document.topics).toHaveLength(2);
      expect(res.body.data.document.topics[0].videos).toBeDefined();
    });

    it("does NOT expose the storagePath (security)", async () => {
      const { accessToken, user } = await createUser();
      const doc = await createDocument(user._id);

      const res = await request(app)
        .get(`/api/documents/${doc._id}`)
        .set(authHeader(accessToken));

      expect(res.body.data.document.storagePath).toBeUndefined();
    });
  });

  describe("❌ Authorization & not found", () => {

    it("returns 404 for another user's document (ownership check)", async () => {
      const { user: owner } = await createUser();
      const { accessToken: attackerToken } = await createOtherUser();
      const doc = await createDocument(owner._id);

      const res = await request(app)
        .get(`/api/documents/${doc._id}`)
        .set(authHeader(attackerToken));

      expect(res.status).toBe(404);
    });

    it("returns 404 for a non-existent document ID", async () => {
      const { accessToken } = await createUser();
      const fakeId = "64a1b2c3d4e5f6789abcdef0";

      const res = await request(app)
        .get(`/api/documents/${fakeId}`)
        .set(authHeader(accessToken));

      expect(res.status).toBe(404);
    });

    it("requires authentication → 401", async () => {
      const { user } = await createUser();
      const doc = await createDocument(user._id);

      const res = await request(app).get(`/api/documents/${doc._id}`);
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════════
describe("GET /api/documents/:id/status", () => {
// ══════════════════════════════════════════════════════════

  it("returns current document status → 200", async () => {
    const { accessToken, user } = await createUser();
    const doc = await createDocument(user._id, { status: "done" });

    const res = await request(app)
      .get(`/api/documents/${doc._id}/status`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("done");
  });

  it("returns 'failed' status with errorMessage", async () => {
    const { accessToken, user } = await createUser();
    const doc = await createDocument(user._id, {
      status: "failed",
      errorMessage: "AI timed out",
    });

    const res = await request(app)
      .get(`/api/documents/${doc._id}/status`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("failed");
    expect(res.body.data.errorMessage).toBe("AI timed out");
  });

  it("blocks access to another user's document status → 404", async () => {
    const { user: owner } = await createUser();
    const { accessToken: otherToken } = await createOtherUser();
    const doc = await createDocument(owner._id);

    const res = await request(app)
      .get(`/api/documents/${doc._id}/status`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════
describe("DELETE /api/documents/:id", () => {
// ══════════════════════════════════════════════════════════

  describe("✅ Success cases", () => {

    it("deletes the document and returns 200", async () => {
      const { accessToken, user } = await createUser();
      const doc = await createDocument(user._id);

      const res = await request(app)
        .delete(`/api/documents/${doc._id}`)
        .set(authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("document no longer exists after deletion", async () => {
      const { accessToken, user } = await createUser();
      const doc = await createDocument(user._id);

      await request(app)
        .delete(`/api/documents/${doc._id}`)
        .set(authHeader(accessToken));

      const Document = require("../../src/models/Document");
      const found = await Document.findById(doc._id);
      expect(found).toBeNull();
    });
  });

  describe("❌ Auth & ownership", () => {

    it("cannot delete another user's document → 404", async () => {
      const { user: owner } = await createUser();
      const { accessToken: attackerToken } = await createOtherUser();
      const doc = await createDocument(owner._id);

      const res = await request(app)
        .delete(`/api/documents/${doc._id}`)
        .set(authHeader(attackerToken));

      expect(res.status).toBe(404);

      // Document must still exist
      const Document = require("../../src/models/Document");
      const found = await Document.findById(doc._id);
      expect(found).not.toBeNull();
    });

    it("returns 404 for non-existent document", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .delete("/api/documents/64a1b2c3d4e5f6789abcdef0")
        .set(authHeader(accessToken));

      expect(res.status).toBe(404);
    });

    it("requires authentication → 401", async () => {
      const { user } = await createUser();
      const doc = await createDocument(user._id);

      const res = await request(app).delete(`/api/documents/${doc._id}`);
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════════
describe("GET /api/documents/:id/topics/:topicIndex/videos/refresh", () => {
// ══════════════════════════════════════════════════════════

  jest.mock("../../src/services/youtubeService", () => ({
    searchVideos: jest.fn().mockResolvedValue([
      {
        title: "Refreshed Video",
        channel: "Edu Channel",
        videoId: "refreshed99",
        thumbnail: "https://i.ytimg.com/vi/refreshed99/hqdefault.jpg",
        link: "https://www.youtube.com/watch?v=refreshed99",
      },
    ]),
  }));

  it("refreshes videos for topic 0 → 200", async () => {
    const { accessToken, user } = await createUser();
    const doc = await createDocument(user._id);

    const res = await request(app)
      .get(`/api/documents/${doc._id}/topics/0/videos/refresh`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.videos).toBeDefined();
  });

  it("returns 404 for out-of-bounds topic index", async () => {
    const { accessToken, user } = await createUser();
    const doc = await createDocument(user._id);

    const res = await request(app)
      .get(`/api/documents/${doc._id}/topics/99/videos/refresh`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(404);
  });

  it("blocks another user from refreshing → 404", async () => {
    const { user: owner } = await createUser();
    const { accessToken: otherToken } = await createOtherUser();
    const doc = await createDocument(owner._id);

    const res = await request(app)
      .get(`/api/documents/${doc._id}/topics/0/videos/refresh`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(404);
  });
});
