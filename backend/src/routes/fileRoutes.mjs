// src/routes/fileRoutes.mjs
import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import cloudinary from "../utils/cloudinary.mjs";
import { File } from "../mongoose/schemas/file.mjs";
import { ActivityLog } from "../mongoose/schemas/activityLog.mjs";
import { authMiddleware } from "../middlewares/authMiddleware.mjs";
import { uploadLimiter } from "../middlewares/rateLimitMiddleware.mjs";
import { logActivity } from "../utils/logActivity.mjs";
import { io } from "../../server.mjs";
import { User } from "../mongoose/schemas/user.mjs";

// ── Multer — store in memory (buffer), not disk ──────────────
const storage = multer.memoryStorage();

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/ogg", "audio/wav",
];

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type '${file.mimetype}' is not allowed.`), false);
  },
});

const router = Router();

// ── Helper: upload buffer to Cloudinary ──────────────────────
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    // Convert buffer to readable stream and pipe
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

// ── Upload ────────────────────────────────────────────────────
router.post(
  "/upload",
  authMiddleware,
  uploadLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided." });

      // Upload buffer to Cloudinary
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "secureshare",
        public_id: `${Date.now()}-${uuidv4()}`,
        resource_type: "auto", // handles images, videos, raw files
      });

      const shareId = uuidv4();
      const newFile = new File({
        filename:      result.public_id,
        originalname:  req.file.originalname,
        mimetype:      req.file.mimetype,
        size:          req.file.size,
        cloudinaryId:  result.public_id,
        cloudinaryUrl: result.secure_url,
        shareId,
        owner: req.user.id,
      });

      await newFile.save();
      io.to(req.user.id).emit("file-uploaded", newFile);
      await logActivity({ userId: req.user.id, action: "uploaded", fileId: newFile._id, fileName: newFile.originalname });

      return res.status(201).json(newFile);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

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

    if (!file.sharedWith.includes(receiver._id)) file.sharedWith.push(receiver._id);
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

    await logActivity({ userId: req.user.id, action: "public_shared", fileId: file._id, fileName: file.originalname });

    res.json({
      message: "Public link generated.",
      isPublic: true,
      publicToken: file.publicToken,
      publicUrl: `${process.env.CLIENT_URL}/public/${file.publicToken}`,
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

    // Redirect to Cloudinary URL (Cloudinary serves it directly)
    return res.redirect(file.cloudinaryUrl);
  } catch (err) {
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

// ── Preview (auth required) ───────────────────────────────────
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
    await logActivity({ userId: req.user.id, action: "previewed", fileId: file._id, fileName: file.originalname });

    // Redirect to Cloudinary secure URL for preview
    return res.redirect(file.cloudinaryUrl);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Download (auth) ───────────────────────────────────────────
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
    await logActivity({ userId: req.user.id, action: "downloaded", fileId: file._id, fileName: file.originalname });

    // Redirect to Cloudinary URL — browser downloads it
    return res.redirect(file.cloudinaryUrl);
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

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(file.cloudinaryId, {
      resource_type: file.mimetype.startsWith("video/") ? "video" : 
                     file.mimetype.startsWith("image/") ? "image" : "raw",
    });

    await logActivity({ userId: req.user.id, action: "deleted", fileId: file._id, fileName: file.originalname });

    return res.status(200).json({ message: "File deleted." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;