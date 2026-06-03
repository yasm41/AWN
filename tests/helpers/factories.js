const User = require("../../src/models/User");
const Document = require("../../src/models/Document");
const { signAccessToken, signRefreshToken, refreshTokenExpiresAt } = require("../../src/utils/jwt");

// ─── Default test data ────────────────────────────────────
const DEFAULT_PASSWORD = "Password123";

const DEFAULT_USER = {
  name: "Test User",
  email: "test@awn.com",
  password: DEFAULT_PASSWORD,
};

/**
 * Create and persist a user in the test DB.
 * Returns { user, accessToken, refreshToken }
 */
const createUser = async (overrides = {}) => {
  const userData = { ...DEFAULT_USER, ...overrides };
  const user = await User.create(userData);

  const accessToken = signAccessToken({ id: user._id });
  const refreshToken = signRefreshToken({ id: user._id });

  // Store refresh token in DB (mirrors real login flow)
  user.refreshTokens.push({
    token: refreshToken,
    deviceInfo: "jest-test-agent",
    expiresAt: refreshTokenExpiresAt(),
  });
  await user.save({ validateBeforeSave: false });

  return { user, accessToken, refreshToken };
};

/**
 * Create a second user with a distinct email (for ownership tests).
 */
const createOtherUser = async () => {
  return createUser({ name: "Other User", email: "other@awn.com" });
};

/**
 * Create a Document record tied to a user (status: done by default).
 */
const createDocument = async (userId, overrides = {}) => {
  return Document.create({
    user: userId,
    originalName: "lecture.pdf",
    fileType: "pdf",
    fileSize: 204800,
    storagePath: "/tmp/fake-file.pdf",
    status: "done",
    topics: [
      {
        title: "Image Segmentation",
        summary: "Image segmentation divides an image into meaningful regions.",
        videos: [
          {
            title: "Image Segmentation Explained",
            channel: "Tech Channel",
            link: "https://www.youtube.com/watch?v=abc123",
            thumbnail: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
            videoId: "abc123",
          },
        ],
      },
      {
        title: "Edge Detection",
        summary: "Edge detection identifies boundaries within an image.",
        videos: [],
      },
    ],
    processingStartedAt: new Date(),
    processingFinishedAt: new Date(),
    ...overrides,
  });
};

/**
 * Auth header helper
 */
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
  DEFAULT_PASSWORD,
  DEFAULT_USER,
  createUser,
  createOtherUser,
  createDocument,
  authHeader,
};
