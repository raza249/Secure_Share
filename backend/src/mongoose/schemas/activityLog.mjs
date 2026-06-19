import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: ["uploaded", "downloaded", "shared", "deleted", "previewed", "public_shared"],
      required: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
    },
    fileName: {
      type: String, // store name at time of action (file may be deleted later)
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // for "shared" actions — who was it shared with
    },
    meta: {
      type: mongoose.Schema.Types.Mixed, // any extra info
    },
  },
  { timestamps: true }
);

export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
