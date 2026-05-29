const User = require("../models/User");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiresAt,
} = require("../utils/jwt");
const { success, error } = require("../utils/response");

// ─── Helpers ──────────────────────────────────────────────
const getDeviceInfo = (req) => {
  return req.headers["user-agent"] || "unknown";
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/register
// @access  Public
// ══════════════════════════════════════════════════════════
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check duplicate
    const exists = await User.findOne({ email });
    if (exists) {
      return error(res, "Email is already registered", 409);
    }

    const user = await User.create({ name, email, password });

    // Issue tokens immediately after registration
    const accessToken = signAccessToken({ id: user._id });
    const refreshToken = signRefreshToken({ id: user._id });

    user.refreshTokens.push({
      token: refreshToken,
      deviceInfo: getDeviceInfo(req),
      expiresAt: refreshTokenExpiresAt(),
    });
    await user.save({ validateBeforeSave: false });

    return success(
      res,
      {
        user,
        accessToken,
        refreshToken,
      },
      "Registration successful",
      201
    );
  } catch (err) {
    console.error("register error:", err);
    return error(res, "Registration failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/login
// @access  Public
// ══════════════════════════════════════════════════════════
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Select password explicitly (it's hidden by default)
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return error(res, "Invalid email or password", 401);
    }

    if (!user.isActive) {
      return error(res, "Account has been deactivated", 403);
    }

    // Clean up expired tokens before adding new one
    user.purgeExpiredTokens();

    const accessToken = signAccessToken({ id: user._id });
    const refreshToken = signRefreshToken({ id: user._id });

    user.refreshTokens.push({
      token: refreshToken,
      deviceInfo: getDeviceInfo(req),
      expiresAt: refreshTokenExpiresAt(),
    });

    await user.save({ validateBeforeSave: false });

    return success(
      res,
      {
        user,
        accessToken,
        refreshToken,
      },
      "Login successful"
    );
  } catch (err) {
    console.error("login error:", err);
    return error(res, "Login failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/refresh
// @access  Public (with refresh token)
// ══════════════════════════════════════════════════════════
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return error(res, "Refresh token required", 400);
    }

    // Verify JWT signature & expiry
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      return error(res, "Invalid or expired refresh token", 401);
    }

    // Find user and confirm token is stored (rotation / reuse detection)
    const user = await User.findById(decoded.id);
    if (!user) {
      return error(res, "User not found", 401);
    }

    const storedToken = user.refreshTokens.find(
      (t) => t.token === refreshToken
    );

    if (!storedToken) {
      // Possible token reuse attack — revoke all tokens
      user.refreshTokens = [];
      await user.save({ validateBeforeSave: false });
      return error(res, "Refresh token reuse detected. All sessions revoked.", 401);
    }

    // Remove the used refresh token (rotation)
    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.token !== refreshToken
    );
    user.purgeExpiredTokens();

    // Issue new pair
    const newAccessToken = signAccessToken({ id: user._id });
    const newRefreshToken = signRefreshToken({ id: user._id });

    user.refreshTokens.push({
      token: newRefreshToken,
      deviceInfo: getDeviceInfo(req),
      expiresAt: refreshTokenExpiresAt(),
    });

    await user.save({ validateBeforeSave: false });

    return success(
      res,
      { accessToken: newAccessToken, refreshToken: newRefreshToken },
      "Token refreshed"
    );
  } catch (err) {
    console.error("refresh error:", err);
    return error(res, "Token refresh failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/logout
// @access  Private
// ══════════════════════════════════════════════════════════
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const user = req.user;

    if (refreshToken) {
      user.refreshTokens = user.refreshTokens.filter(
        (t) => t.token !== refreshToken
      );
    }

    await user.save({ validateBeforeSave: false });

    return success(res, {}, "Logged out successfully");
  } catch (err) {
    console.error("logout error:", err);
    return error(res, "Logout failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   POST /api/auth/logout-all
// @access  Private  — revoke ALL sessions
// ══════════════════════════════════════════════════════════
const logoutAll = async (req, res) => {
  try {
    req.user.refreshTokens = [];
    await req.user.save({ validateBeforeSave: false });
    return success(res, {}, "Logged out from all devices");
  } catch (err) {
    return error(res, "Logout failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   GET /api/auth/me
// @access  Private
// ══════════════════════════════════════════════════════════
const getMe = async (req, res) => {
  return success(res, { user: req.user }, "User retrieved");
};

// ══════════════════════════════════════════════════════════
// @route   PATCH /api/auth/me
// @access  Private — update name / avatar
// ══════════════════════════════════════════════════════════
const updateMe = async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const user = req.user;

    if (name) user.name = name;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    return success(res, { user }, "Profile updated");
  } catch (err) {
    return error(res, "Profile update failed", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   PATCH /api/auth/change-password
// @access  Private
// ══════════════════════════════════════════════════════════
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");

    if (!(await user.comparePassword(currentPassword))) {
      return error(res, "Current password is incorrect", 400);
    }

    user.password = newPassword;
    // Revoke all existing refresh tokens on password change
    user.refreshTokens = [];
    await user.save();

    return success(res, {}, "Password changed. Please log in again.");
  } catch (err) {
    return error(res, "Password change failed", 500);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  updateMe,
  changePassword,
};
