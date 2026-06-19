// src/mongoose/schemas/file.mjs
import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    filename:     { type: String, required: true },
    originalname: { type: String, required: true },
    mimetype:     String,
    size:         Number,

    cloudinaryId:  { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    resourceType:  { type: String, default: "raw" },

    shareId:    { type: String, unique: true },
    owner:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    isPublic:            { type: Boolean, default: false },
    publicToken:         { type: String, unique: true, sparse: true },
    publicLinkExpiresAt: { type: Date, default: null },

    downloadCount: { type: Number, default: 0 },
    previewCount:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const File = mongoose.model("File", fileSchema);
