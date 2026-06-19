import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalname: { type: String, required: true },
    mimetype: String,
    size: Number,
    path: { type: String, required: true },

    // Existing share system (user-to-user)
    shareId: { type: String, unique: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // 🆕 Public share link
    isPublic: { type: Boolean, default: false },
    publicToken: { type: String, unique: true, sparse: true }, // unique URL token
    publicLinkExpiresAt: { type: Date, default: null }, // null = never expires

    // 🆕 Stats
    downloadCount: { type: Number, default: 0 },
    previewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const File = mongoose.model("File", fileSchema);