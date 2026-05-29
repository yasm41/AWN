const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: String,
    channel: String,
    link: String,
    thumbnail: String,
    videoId: String,
  },
  { _id: false }
);

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Educational Topic" },
    summary: { type: String, default: "" },
    videos: [videoSchema],
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ["pdf", "docx", "txt", "pptx", "csv", "image"],
      required: true,
    },
    fileSize: {
      type: Number, // bytes
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "failed"],
      default: "pending",
    },
    errorMessage: {
      type: String,
      default: null,
    },
    topics: [topicSchema],
    processingStartedAt: Date,
    processingFinishedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Document", documentSchema);
