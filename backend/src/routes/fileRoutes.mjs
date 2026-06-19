// src/routes/fileRoutes.mjs
import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import https from "https";
import http from "http";
import cloudinary from "../utils/cloudinary.mjs";
import { File } from "../mongoose/schemas/file.mjs";
import { ActivityLog } from "../mongoose/schemas/activityLog.mjs";
import { authMiddleware } from "../middlewares/authMiddleware.mjs";
import { uploadLimiter } from "../middlewares/rateLimitMiddleware.mjs";
import { logActivity } from "../utils/logActivity.mjs";
import { io } from "../../server.mjs";
import { User } from "../mongoose/schemas/user.mjs";

const storage = multer.memoryStorage();

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "text/"];

const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-7z-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf","doc","docx","xls","xlsx","ppt","pptx","txt","rtf","odt","csv",
  "jpg","jpeg","png","gif","bmp","webp","svg","ico","tiff",
  "mp4","mkv","mov","avi","wmv","webm","flv",
  "mp3","wav","ogg","flac","aac","m4a",
  "py","java","js","jsx","ts","tsx","html","htm","css","scss","sass",
  "c","cpp","h","cs","go","rb","php","swift","kt","rs","sh","bash",
  "json","xml","yaml","yml","toml","ini","env","md","sql","r","m",
  "vue","svelte","dart","lua","pl","scala","hs","ex","exs","clj",
  "lock","config","log","gitignore","dockerfile","makefile",
  "zip","rar","tar","gz","7z","bz2",
]);

function getExtension(filename) {
  return (filename || "").split(".").pop().toLowerCase();
}

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = file.mimetype || "";
    const ext  = getExtension(file.originalname);

    const mimeOk =
      ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p)) ||
      ALLOWED_MIME_EXACT.has(mime);

    const extOk = ALLOWED_EXTENSIONS.has(ext);

    if (mimeOk && extOk) return cb(null, true);
    if (mime === "application/octet-stream" && extOk) return cb(null, true);

    const err = new Error(`File type ".${ext}" (${mime}) is not allowed.`);
    err.code  = "LIMIT_FILE_TYPE";
    return cb(err, false);
  },
});

function handleMulterError(err, req, res, next) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ error: "File too large. Max 50 MB." });
  if (err.code === "LIMIT_FILE_TYPE")
    return res.status(400).json({ error: err.message });
  return res.status(400).json({ error: err.message || "Upload error." });
}

const router = Router();

function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

function proxyUrl(url, res, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, (cloudRes) => {
      const ct = cloudRes.headers["content-type"] || "application/octet-stream";
      res.setHeader("Content-Type", ct);
      if (cloudRes.headers["content-length"])
        res.setHeader("Content-Length", cloudRes.headers["content-length"]);
      Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      cloudRes.pipe(res);
      cloudRes.on("end", resolve);
    }).on("error", reject);
  });
}

// ── Upload ────────────────────────────────────────────────────
router.post(
  "/upload",
  authMiddleware,
  uploadLimiter,
  upload.single("file"),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided." });

      const mime = req.file.mimetype || "";
      let resourceType = "raw";
      if (mime.startsWith("image/")) resourceType = "image";
      else if (mime.startsWith("video/") || mime.startsWith("audio/")) resourceType = "video";

      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "secureshare",
        public_id: `${Date.now()}-${uuidv4()}`,
        resource_type: resourceType,
        context: `original_filename=${req.file.originalname}`,
      });

      const newFile = new File({
        filename:      result.public_id,
        originalname:  req.file.originalname,
        mimetype:      req.file.mimetype,
        size:          req.file.size,
        cloudinaryId:  result.public_id,
        cloudinaryUrl: result.secure_url,
        resourceType,
        shareId: uuidv4(),
        owner:   req.user.id,
      });

      await newFile.save();
      io.to(req.user.id).emit("file-uploaded", newFile);
      await logActivity({
        userId: req.user.id, action: "uploaded",
        fileId: newFile._id, fileName: newFile.originalname,
      });

      return res.status(201).json(newFile);
    } catch (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ── Preview ───────────────────────────────────────────────────
router.get("/preview/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: "File not found." });

    const allowed =
      file.owner.toString() === req.user.id ||
      file.sharedWith.some(id => id.toString() === req.user.id);
    if (!allowed) return res.status(403).json({ message: "Access denied." });

    file.previewCount = (file.previewCount || 0) + 1;
    await file.save();
    await logActivity({
      userId: req.user.id, action: "previewed",
      fileId: file._id, fileName: file.originalname,
    });

    await proxyUrl(file.cloudinaryUrl, res);
  } catch (err) {
    console.error("Preview error:", err);
    if (!res.headersSent)
      res.status(500).json({ message: err.message });
  }
});

// ── Download ──────────────────────────────────────────────────
router.get("/download/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: "File not found." });

    const allowed =
      file.owner.toString() === req.user.id ||
      file.sharedWith.some(id => id.toString() === req.user.id);
    if (!allowed) return res.status(403).json({ message: "Access denied." });

    file.downloadCount = (file.downloadCount || 0) + 1;
    await file.save();
    await logActivity({
      userId: req.user.id, action: "downloaded",
      fileId: file._id, fileName: file.originalname,
    });

    const encoded = encodeURIComponent(file.originalname);
    await proxyUrl(file.cloudinaryUrl, res, {
      "Content-Disposition": `attachment; filename="${file.originalname}"; filename*=UTF-8''${encoded}`,
    });
  } catch (err) {
    console.error("Download error:", err);
    if (!res.headersSent)
      res.status(500).json({ message: err.message });
  }
});

// ── Public link toggle ────────────────────────────────────────
router.post("/public-link/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user.id });
    if (!file) return res.status(404).json({ message: "File not found." });

    if (file.isPublic) {
      file.isPublic = false;
      file.publicToken = undefined;
      file.publicLinkExpiresAt = null;
      await file.save();
      return res.json({ message: "Public link disabled.", isPublic: false });
    }

    const { expiresIn } = req.body;
    file.isPublic = true;
    file.publicToken = uuidv4();
    file.publicLinkExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
      : null;
    await file.save();

    await logActivity({
      userId: req.user.id, action: "public_shared",
      fileId: file._id, fileName: file.originalname,
    });

    const publicUrl = `${process.env.CLIENT_URL}/public/${file.publicToken}`;
    res.json({
      message: "Public link generated.",
      isPublic: true,
      publicToken: file.publicToken,
      publicUrl,
      expiresAt: file.publicLinkExpiresAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Public download (no auth) ─────────────────────────────────
router.get("/public/:token", async (req, res) => {
  try {
    const file = await File.findOne({ publicToken: req.params.token, isPublic: true });
    if (!file) return res.status(404).json({ message: "Link not found or disabled." });

    if (file.publicLinkExpiresAt && new Date() > file.publicLinkExpiresAt) {
      file.isPublic = false; file.publicToken = undefined;
      await file.save();
      return res.status(410).json({ message: "This link has expired." });
    }

    file.downloadCount = (file.downloadCount || 0) + 1;
    await file.save();

    const encoded = encodeURIComponent(file.originalname);
    await proxyUrl(file.cloudinaryUrl, res, {
      "Content-Disposition": `attachment; filename="${file.originalname}"; filename*=UTF-8''${encoded}`,
    });
  } catch (err) {
    if (!res.headersSent)
      res.status(500).json({ message: err.message });
  }
});

// ── Public file info ──────────────────────────────────────────
router.get("/public-info/:token", async (req, res) => {
  try {
    const file = await File.findOne({ publicToken: req.params.token, isPublic: true })
      .populate("owner", "username");
    if (!file) return res.status(404).json({ message: "Link not found or disabled." });

    if (file.publicLinkExpiresAt && new Date() > file.publicLinkExpiresAt)
      return res.status(410).json({ message: "This link has expired." });

    res.json({
      originalname:  file.originalname,
      mimetype:      file.mimetype,
      size:          file.size,
      owner:         file.owner?.username,
      downloadCount: file.downloadCount,
      createdAt:     file.createdAt,
      expiresAt:     file.publicLinkExpiresAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Share with user ───────────────────────────────────────────
router.post("/share", authMiddleware, async (req, res) => {
  try {
    const { fileId, receiverEmail } = req.body;
    if (!fileId || !receiverEmail)
      return res.status(400).json({ message: "fileId and receiverEmail required." });

    const receiver = await User.findOne({ email: receiverEmail });
    if (!receiver) return res.status(404).json({ message: "Receiver not found." });
    if (receiver._id.toString() === req.user.id)
      return res.status(400).json({ message: "Cannot share with yourself." });

    const file = await File.findOne({ _id: fileId, owner: req.user.id });
    if (!file) return res.status(404).json({ message: "File not found." });

    if (!file.sharedWith.map(String).includes(receiver._id.toString()))
      file.sharedWith.push(receiver._id);
    await file.save();

    io.to(receiver._id.toString()).emit("file-shared", file);
    await logActivity({
      userId: req.user.id, action: "shared",
      fileId: file._id, fileName: file.originalname,
      targetUser: receiver._id,
    });

    res.json({ message: "File shared successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Received files ────────────────────────────────────────────
router.get("/received", authMiddleware, async (req, res) => {
  try {
    const files = await File.find({ sharedWith: req.user.id })
      .populate("owner", "username email")
      .sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Activity log ──────────────────────────────────────────────
router.get("/activity", authMiddleware, async (req, res) => {
  try {
    const logs = await ActivityLog.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("targetUser", "username email");
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── List my files ─────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const files = await File.find({ owner: req.user.id }).sort({ createdAt: -1 });
    return res.status(200).json(files);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete ────────────────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!file) return res.status(404).json({ message: "File not found." });

    const resourceType = file.resourceType ||
      (file.mimetype?.startsWith("video/") || file.mimetype?.startsWith("audio/") ? "video" :
       file.mimetype?.startsWith("image/") ? "image" : "raw");

    await cloudinary.uploader.destroy(file.cloudinaryId, { resource_type: resourceType });

    await logActivity({
      userId: req.user.id, action: "deleted",
      fileId: file._id, fileName: file.originalname,
    });

    return res.status(200).json({ message: "File deleted." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
