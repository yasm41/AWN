const request = require("supertest");
const path = require("path");
const fs = require("fs");
const os = require("os");
const app = require("../../src/app");
const db = require("../helpers/db");
const { createUser, authHeader } = require("../helpers/factories");

// ── Silence AI service during upload tests ────────────────
jest.mock("../../src/services/aiService", () => ({
  processDocument: jest.fn().mockResolvedValue([
    {
      title: "Mock Topic",
      summary: "This is a mock summary for testing.",
      videos: [],
    },
  ]),
  pingAI: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../src/services/youtubeService", () => ({
  searchVideos: jest.fn().mockResolvedValue([
    {
      title: "Mock Video",
      channel: "Mock Channel",
      videoId: "mock123",
      thumbnail: "https://i.ytimg.com/vi/mock123/hqdefault.jpg",
      link: "https://www.youtube.com/watch?v=mock123",
    },
  ]),
}));

// ── Fixture files ─────────────────────────────────────────
const TMP_DIR = os.tmpdir();

const createTempFile = (name, content = "test content") => {
  const filePath = path.join(TMP_DIR, name);
  fs.writeFileSync(filePath, content);
  return filePath;
};

let txtFile, pdfFile, largeFile;

beforeAll(async () => {
  await db.connect();
  txtFile = createTempFile("test.txt", "Hello world. This is a test document.");
  pdfFile = createTempFile("test.pdf", "%PDF-1.4 fake pdf content for testing");
  // 21MB fake file to test size limit
  largeFile = createTempFile("large.txt", "x".repeat(22 * 1024 * 1024));
});

afterEach(async () => { await db.clearDatabase(); });

afterAll(async () => {
  await db.disconnect();
  [txtFile, pdfFile, largeFile].forEach((f) => {
    try { fs.unlinkSync(f); } catch (_) {}
  });
});

// ══════════════════════════════════════════════════════════
describe("POST /api/documents/upload", () => {
// ══════════════════════════════════════════════════════════

  describe("✅ Success cases", () => {

    it("uploads a .txt file and returns 202 with document record", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .post("/api/documents/upload")
        .set(authHeader(accessToken))
        .attach("file", txtFile);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.document).toMatchObject({
        originalName: "test.txt",
        fileType: "txt",
        status: expect.stringMatching(/pending|processing|done/),
      });
    });

    it("returns a document _id that can be used for status polling", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .post("/api/documents/upload")
        .set(authHeader(accessToken))
        .attach("file", txtFile);

      expect(res.body.data.document._id).toBeDefined();
    });

    it("associates the uploaded document with the authenticated user", async () => {
      const { accessToken, user } = await createUser();

      const uploadRes = await request(app)
        .post("/api/documents/upload")
        .set(authHeader(accessToken))
        .attach("file", txtFile);

      const Document = require("../../src/models/Document");
      const doc = await Document.findById(uploadRes.body.data.document._id);
      expect(doc.user.toString()).toBe(user._id.toString());
    });

    it("uploads a .pdf file successfully", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .post("/api/documents/upload")
        .set(authHeader(accessToken))
        .attach("file", pdfFile);

      expect(res.status).toBe(202);
      expect(res.body.data.document.fileType).toBe("pdf");
    });
  });

  describe("❌ Auth & authorization", () => {

    it("requires authentication → 401", async () => {
      const res = await request(app)
        .post("/api/documents/upload")
        .attach("file", txtFile);

      expect(res.status).toBe(401);
    });

    it("rejects invalid token → 401", async () => {
      const res = await request(app)
        .post("/api/documents/upload")
        .set({ Authorization: "Bearer fake.token.here" })
        .attach("file", txtFile);

      expect(res.status).toBe(401);
    });
  });

  describe("❌ File validation", () => {

    it("rejects request with no file → 400", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .post("/api/documents/upload")
        .set(authHeader(accessToken));

      expect(res.status).toBe(400);
    });

    it("rejects unsupported file types (e.g. .exe) → 400", async () => {
      const { accessToken } = await createUser();
      const exeFile = createTempFile("malware.exe", "MZ fake exe");

      const res = await request(app)
        .post("/api/documents/upload")
        .set(authHeader(accessToken))
        .attach("file", exeFile);

      expect(res.status).toBe(400);
      fs.unlinkSync(exeFile);
    });

    it("rejects files exceeding the 20MB size limit → 413", async () => {
      const { accessToken } = await createUser();

      const res = await request(app)
        .post("/api/documents/upload")
        .set(authHeader(accessToken))
        .attach("file", largeFile);

      expect(res.status).toBe(413);
    });
  });
});
