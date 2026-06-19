// src/middlewares/fileValidationMiddleware.mjs

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-rar-compressed",
  "video/mp4", "video/webm", "video/ogg",
  "audio/mpeg", "audio/ogg", "audio/wav",
];

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided." });
  }

  if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
    return res.status(415).json({
      error: `File type '${req.file.mimetype}' is not allowed.`,
      allowedTypes: ALLOWED_TYPES,
    });
  }

  if (req.file.size > MAX_SIZE_BYTES) {
    return res.status(413).json({
      error: `File too large. Maximum size is ${MAX_SIZE_BYTES / 1024 / 1024} MB.`,
    });
  }

  next();
};
