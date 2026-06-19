// src/utils/logActivity.mjs
import { ActivityLog } from "../mongoose/schemas/activityLog.mjs";

/**
 * Log an activity.
 * @param {object} opts
 * @param {string} opts.userId       - who performed the action
 * @param {string} opts.action       - uploaded | downloaded | shared | deleted | previewed | public_shared
 * @param {string} [opts.fileId]     - file involved
 * @param {string} [opts.fileName]   - file name at time of action
 * @param {string} [opts.targetUser] - recipient (for "shared")
 * @param {object} [opts.meta]       - any extra data
 */
export async function logActivity({ userId, action, fileId, fileName, targetUser, meta } = {}) {
  try {
    await ActivityLog.create({
      user: userId,
      action,
      fileId,
      fileName,
      targetUser,
      meta,
    });
  } catch (err) {
    // Never let logging break the main request
    console.error("ActivityLog error:", err.message);
  }
}