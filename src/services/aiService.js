const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const AI_BASE_URL = process.env.AI_BASE_URL || "https://gabr83-graduationproject.hf.space";

/**
 * Uploads a file to the HuggingFace Gradio Space and retrieves
 * the processed result: topics, summaries, and YouTube videos.
 *
 * The Gradio Space exposes a /run/predict endpoint.
 * We POST the file as a base64 data URL which Gradio accepts.
 *
 * @param {string} filePath  - Absolute path to the file on disk
 * @param {string} mimeType  - MIME type of the file
 * @returns {Promise<Array>} - Array of topic objects { title, summary, videos }
 */
const processDocument = async (filePath, mimeType) => {
  // Read file and encode as base64
  const fileBuffer = fs.readFileSync(filePath);
  const base64File = fileBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64File}`;

  // Gradio predict payload
  const payload = {
    data: [dataUrl],
  };

  const response = await axios.post(
    `${AI_BASE_URL}/run/predict`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
      timeout: 300000, // 5 minutes — AI processing can be slow
    }
  );

  const result = response.data;

  // The Space returns data array — first element is our structured output
  if (!result || !result.data || !result.data[0]) {
    throw new Error("Unexpected response structure from AI service");
  }

  return parseAIResponse(result.data[0]);
};

/**
 * Parses the AI service response into the topic array shape
 * expected by our Document model.
 *
 * Handles both:
 *   - Structured JSON output (preferred)
 *   - Raw text output (fallback parsing)
 */
const parseAIResponse = (rawOutput) => {
  // If the space returns JSON directly
  if (typeof rawOutput === "object" && Array.isArray(rawOutput)) {
    return rawOutput.map((topic) => ({
      title: topic.title || "Educational Topic",
      summary: topic.summary || "",
      videos: (topic.videos || []).map((v) => ({
        title: v.title || "",
        channel: v.channel || "",
        link: v.link || "",
        thumbnail: v.thumbnail || "",
        videoId: extractVideoId(v.link || ""),
      })),
    }));
  }

  // If the space returns a JSON string
  if (typeof rawOutput === "string") {
    try {
      const parsed = JSON.parse(rawOutput);
      return parseAIResponse(parsed);
    } catch (_) {
      // Fall through to text parsing
    }
  }

  // Minimal fallback: wrap the raw text as a single topic
  return [
    {
      title: "Processed Content",
      summary: String(rawOutput).slice(0, 2000),
      videos: [],
    },
  ];
};

/**
 * Extract YouTube video ID from a watch URL
 */
const extractVideoId = (url) => {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : "";
};

/**
 * Health-check the AI service
 */
const pingAI = async () => {
  try {
    const res = await axios.get(`${AI_BASE_URL}/`, { timeout: 10000 });
    return res.status === 200;
  } catch (_) {
    return false;
  }
};

module.exports = { processDocument, pingAI };
