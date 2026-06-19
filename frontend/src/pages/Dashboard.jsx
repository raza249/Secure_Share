import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import API from "../api";

const socket = io( import.meta.env.VITE_SOCKET_URL ||  "http://localhost:5000", {
  auth: { token: localStorage.getItem("token") },
});

// ─── Helpers ──────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(str) {
  return new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(str) {
  const diff = Date.now() - new Date(str).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getFileIcon(mimetype = "") {
  if (mimetype.startsWith("image/")) return { icon: "🖼️", cls: "type-image" };
  if (mimetype === "application/pdf") return { icon: "📄", cls: "type-pdf" };
  if (mimetype.startsWith("video/")) return { icon: "🎬", cls: "type-video" };
  if (mimetype.startsWith("audio/")) return { icon: "🎵", cls: "type-doc" };
  if (mimetype.includes("word") || mimetype.includes("document")) return { icon: "📝", cls: "type-doc" };
  if (mimetype.includes("zip") || mimetype.includes("rar")) return { icon: "🗜️", cls: "type-zip" };
  if (mimetype.startsWith("text/")) return { icon: "📃", cls: "type-doc" };
  return { icon: "📁", cls: "type-other" };
}

function canPreview(mimetype = "") {
  return (
    mimetype.startsWith("image/") ||
    mimetype === "application/pdf" ||
    mimetype.startsWith("text/") ||
    mimetype.startsWith("video/") ||
    mimetype.startsWith("audio/")
  );
}

const storedUser = JSON.parse(localStorage.getItem("user") || "{}");

// ─── Toast ────────────────────────────────────────────────────
let toastId = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = "info") => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }) {
  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-icon">{icons[t.type]}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────
function PreviewModal({ file, onClose }) {
  const previewUrl = `http://localhost:5000/api/files/preview/${file._id}`;
  const token = localStorage.getItem("token");
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch with auth token and create blob URL
    fetch(previewUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        setBlobUrl(URL.createObjectURL(blob));
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl, file._id, previewUrl, token]);

  const renderContent = () => {
    if (loading) return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <p>Loading preview…</p>
      </div>
    );
    if (!blobUrl) return <p style={{ color: "#f87171", textAlign: "center", padding: 40 }}>Preview failed to load.</p>;

    const mime = file.mimetype || "";
    if (mime.startsWith("image/"))
      return <img src={blobUrl} alt={file.originalname} style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain", borderRadius: 12 }} />;
    if (mime === "application/pdf")
      return <iframe src={blobUrl} style={{ width: "100%", height: "65vh", border: "none", borderRadius: 12 }} title="PDF Preview" />;
    if (mime.startsWith("video/"))
      return <video src={blobUrl} controls style={{ width: "100%", maxHeight: "65vh", borderRadius: 12 }} />;
    if (mime.startsWith("audio/"))
      return <audio src={blobUrl} controls style={{ width: "100%", marginTop: 20 }} />;
    if (mime.startsWith("text/"))
      return (
        <iframe src={blobUrl} style={{ width: "100%", height: "55vh", border: "none", borderRadius: 12, background: "#0a0f2e" }} title="Text Preview" />
      );
    return <p style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>Preview not available for this file type.</p>;
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 800, width: "95vw" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0 }}>👁️ Preview</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>{file.originalname}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 16, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {renderContent()}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <span style={{ color: "#94a3b8", fontSize: 13, alignSelf: "center" }}>{formatBytes(file.size)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Share Modal ──────────────────────────────────────────────
function ShareModal({ file, users, onClose, onShare, onPublicLink }) {
  const [receiver, setReceiver] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePublicLink = async () => {
    setPublicLoading(true);
    await onPublicLink(file._id, file.isPublic);
    setPublicLoading(false);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/public/${file.publicToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>📤 Share File</h3>
        <p style={{ marginBottom: 20 }}>Sharing: <strong style={{ color: "#fff" }}>{file.originalname}</strong></p>

        {/* User-to-user share */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 8 }}>
            Share with a User
          </div>
          <select className="modal-select" value={receiver} onChange={e => setReceiver(e.target.value)}>
            <option value="">Select a user...</option>
            {users.map(u => (
              <option key={u._id} value={u.email}>{u.username} ({u.email})</option>
            ))}
          </select>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => { onShare(file._id, receiver); onClose(); }}>
            Send to User
          </button>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "20px 0" }} />

        {/* Public link */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 8 }}>
            🌐 Public Link
          </div>
          {file.isPublic ? (
            <div>
              <div style={{
                padding: "10px 14px", background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.25)", borderRadius: 10,
                fontSize: 13, color: "#34d399", marginBottom: 10,
                wordBreak: "break-all"
              }}>
                {window.location.origin}/public/{file.publicToken}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={copyLink}>
                  {copied ? "✅ Copied!" : "📋 Copy Link"}
                </button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={handlePublicLink} disabled={publicLoading}>
                  {publicLoading ? "…" : "🚫 Disable Link"}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ width: "100%" }} onClick={handlePublicLink} disabled={publicLoading}>
              {publicLoading ? "Generating…" : "🔗 Generate Public Link"}
            </button>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log Tab ─────────────────────────────────────────
const ACTION_META = {
  uploaded:      { icon: "⬆️", label: "Uploaded",       color: "#818cf8" },
  downloaded:    { icon: "⬇️", label: "Downloaded",     color: "#34d399" },
  shared:        { icon: "📤", label: "Shared",          color: "#a78bfa" },
  deleted:       { icon: "🗑️", label: "Deleted",        color: "#f87171" },
  previewed:     { icon: "👁️", label: "Previewed",      color: "#67e8f9" },
  public_shared: { icon: "🌐", label: "Public link",     color: "#fbbf24" },
};

function ActivityLogTab({ logs, loading }) {
  if (loading) return (
    <div className="empty-state"><div className="empty-icon">⏳</div><p>Loading activity…</p></div>
  );
  if (!logs.length) return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <h3>No activity yet</h3>
      <p>Your file actions will appear here</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {logs.map((log, i) => {
        const meta = ACTION_META[log.action] || { icon: "•", label: log.action, color: "#94a3b8" };
        return (
          <div key={log._id || i} style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 18px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            transition: "background 0.2s",
          }}>
            {/* Icon badge */}
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: `${meta.color}18`,
              border: `1px solid ${meta.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>
              {meta.icon}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>
                  {meta.label}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 999, background: `${meta.color}18`,
                  color: meta.color, border: `1px solid ${meta.color}30`,
                }}>
                  {log.action}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {log.fileName || "Unknown file"}
                {log.targetUser && ` → ${log.targetUser.username}`}
              </div>
            </div>

            {/* Time */}
            <div style={{ fontSize: 12, color: "#475569", flexShrink: 0 }}>
              {timeAgo(log.createdAt)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── File Card ────────────────────────────────────────────────
function FileCard({ file, onDelete, onShare, onDownload, onPreview, isShared }) {
  const { icon, cls } = getFileIcon(file.mimetype);
  const previewable = canPreview(file.mimetype);

  return (
    <div className="file-card">
      <div className={`file-type-icon ${cls}`}>{icon}</div>
      <div className="file-name" title={file.originalname}>{file.originalname}</div>
      <div className="file-meta">
        <span>📦 {formatBytes(file.size)}</span>
        <span>📅 {formatDate(file.createdAt)}</span>
        {!isShared && file.downloadCount > 0 && <span>⬇️ {file.downloadCount}</span>}
        {isShared && file.owner && <span>👤 {file.owner.username}</span>}
        {file.isPublic && <span style={{ color: "#fbbf24" }}>🌐 Public</span>}
      </div>
      <div className="file-actions">
        {previewable && (
          <button className="btn btn-ghost btn-sm" onClick={() => onPreview(file)}>
            👁️ Preview
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => onDownload(file._id, file.originalname)}>
          ⬇️ Download
        </button>
        {!isShared && (
          <>
            <button className="btn btn-sm" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }} onClick={() => onShare(file)}>
              📤 Share
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(file._id)}>🗑️</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────
function Dashboard() {
  const [activeTab, setActiveTab] = useState("myfiles");
  const [files, setFiles] = useState([]);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileRef = useRef();
  const { toasts, show: toast } = useToast();

  const getFiles = async () => {
    try { const res = await API.get("/files"); setFiles(res.data); } catch { /* empty */ }
  };
  const getReceivedFiles = async () => {
    try { const res = await API.get("/files/received"); setReceivedFiles(res.data); } catch { /* empty */ }
  };
  const getUsers = async () => {
    try { const res = await API.get("/users"); setUsers(res.data); } catch { /* empty */ }
  };
  const getActivity = async () => {
    setActivityLoading(true);
    try { const res = await API.get("/files/activity"); setActivityLogs(res.data); } catch { /* empty */ }
    setActivityLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    getFiles(); getReceivedFiles(); getUsers();
    const uid = localStorage.getItem("userId");
    if (uid) socket.emit("join-room", uid);
    socket.on("file-uploaded", getFiles);
    socket.on("file-shared", () => { getReceivedFiles(); toast("📨 A file was shared with you!", "info"); });
    return () => { socket.off("file-uploaded"); socket.off("file-shared"); };
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "activity") getActivity();
  }, [activeTab]);

  const uploadFile = async (fileToUpload) => {
    if (!fileToUpload) { toast("Please select a file", "error"); return; }
    if (fileToUpload.size > 50 * 1024 * 1024) { toast("File too large. Max 50 MB.", "error"); return; }
    const formData = new FormData();
    formData.append("file", fileToUpload);
    try {
      setUploading(true); setUploadProgress(0);
      await API.post("/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: e => setUploadProgress(Math.round((e.loaded * 100) / e.total)),
      });
      toast("File uploaded!", "success");
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFile(null);
      getFiles();
    } catch (err) {
      toast(err.response?.data?.error || "Upload failed", "error");
    } finally { setUploading(false); setUploadProgress(0); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); uploadFile(file); }
  };

  const shareFile = async (fileId, receiverEmail) => {
    if (!receiverEmail) { toast("Select a user", "error"); return; }
    try {
      await API.post("/files/share", { fileId, receiverEmail });
      toast("File shared!", "success");
    } catch (err) {
      toast(err.response?.data?.message || "Share failed", "error");
    }
  };

  const togglePublicLink = async (fileId, isCurrentlyPublic) => {
    try {
      const res = await API.post(`/files/public-link/${fileId}`);
      toast(isCurrentlyPublic ? "Public link disabled" : "Public link generated!", "success");
      getFiles(); // refresh to get updated publicToken
      return res.data;
    } catch (err) {
      toast(err.response?.data?.message || "Failed", "error");
    }
  };

  const downloadFile = async (id, originalname) => {
    try {
      const res = await API.get(`/files/download/${id}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url; link.setAttribute("download", originalname);
      document.body.appendChild(link); link.click(); link.remove();
      toast("Download started!", "success");
      getFiles(); // refresh download count
    } catch { toast("Download failed", "error"); }
  };

  const deleteFile = async (id) => {
    if (!window.confirm("Delete this file?")) return;
    try {
      await API.delete(`/files/${id}`); getFiles();
      toast("File deleted", "info");
    } catch { toast("Delete failed", "error"); }
  };

  const logout = () => { localStorage.clear(); window.location.href = "/login"; };

  const filtered = (activeTab === "myfiles" ? files : receivedFiles)
    .filter(f => f.originalname?.toLowerCase().includes(search.toLowerCase()));

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  const navItems = [
    { id: "myfiles",  icon: "📁", label: "My Files",        count: files.length },
    { id: "shared",   icon: "📨", label: "Shared With Me",  count: receivedFiles.length },
    { id: "upload",   icon: "⬆️", label: "Upload" },
    { id: "activity", icon: "📋", label: "Activity Log" },
  ];

  return (
    <div className="page-root">
      <div className="aurora-bg"><div className="aurora-orb" /></div>

      <div className="dash-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">🔒</div>
            <h2>SecureShare</h2>
          </div>

          <div className="nav-label">Navigation</div>
          {navItems.map(nav => (
            <button key={nav.id} className={`nav-item ${activeTab === nav.id ? "active" : ""}`} onClick={() => setActiveTab(nav.id)}>
              <span className="nav-icon">{nav.icon}</span>
              {nav.label}
              {nav.count !== undefined && (
                <span style={{ marginLeft: "auto", fontSize: 11, background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 999 }}>
                  {nav.count}
                </span>
              )}
            </button>
          ))}

          <div className="sidebar-bottom">
            <div className="user-chip">
              <div className="user-avatar">{(storedUser.username || "U")[0].toUpperCase()}</div>
              <div className="user-info">
                <p>{storedUser.username || "User"}</p>
                <span style={{ fontSize: 11, color: "#64748b" }}>{storedUser.email || ""}</span>
              </div>
            </div>
            <button className="logout-btn" onClick={logout}>🚪 Sign Out</button>
          </div>
        </aside>

        {/* Main */}
        <main className="main-content">
          <div className="page-header">
            <h1>
              {activeTab === "myfiles"  && "My Files"}
              {activeTab === "shared"   && "Shared With Me"}
              {activeTab === "upload"   && "Upload File"}
              {activeTab === "activity" && "Activity Log"}
            </h1>
            <p>
              {activeTab === "myfiles"  && "Manage, preview, and share your files"}
              {activeTab === "shared"   && "Files other users have shared with you"}
              {activeTab === "upload"   && "Upload a file to your secure vault — max 50 MB"}
              {activeTab === "activity" && "Every action on your files, tracked in real time"}
            </p>
          </div>

          {/* Stats */}
          {activeTab === "myfiles" && (
            <div className="stats-row">
              {[
                { icon: "📁", label: "Total Files",    value: files.length,           cls: "purple" },
                { icon: "📨", label: "Received",       value: receivedFiles.length,   cls: "cyan" },
                { icon: "💾", label: "Storage Used",   value: formatBytes(totalSize), cls: "green" },
              ].map(s => (
                <div key={s.label} className="stat-card fade-up-delay-1">
                  <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                  <div className="stat-info"><p>{s.value}</p><span>{s.label}</span></div>
                </div>
              ))}
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === "upload" && (
            <div className="fade-up-delay-1">
              <div
                className={`upload-zone ${dragging ? "dragging" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <input ref={fileRef} type="file" onChange={e => setSelectedFile(e.target.files[0])} />
                <div className="upload-zone-icon">☁️</div>
                <h3>{selectedFile ? selectedFile.name : "Drop your file here"}</h3>
                <p>{selectedFile ? formatBytes(selectedFile.size) : "or click to browse — Max 50 MB"}</p>
                {uploading && (
                  <div className="progress-wrap" style={{ marginTop: 16 }}>
                    <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => uploadFile(selectedFile || fileRef.current?.files[0])} disabled={uploading}>
                  {uploading ? `Uploading ${uploadProgress}%…` : "⬆️ Upload File"}
                </button>
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === "activity" && (
            <ActivityLogTab logs={activityLogs} loading={activityLoading} />
          )}

          {/* File Lists */}
          {(activeTab === "myfiles" || activeTab === "shared") && (
            <>
              <div className="search-bar fade-up-delay-1">
                <span className="search-icon">🔍</span>
                <input placeholder="Search files…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>

              <div className="section-heading">
                <h2>{activeTab === "myfiles" ? "My Files" : "Shared With Me"}</h2>
                <span>{filtered.length} file{filtered.length !== 1 ? "s" : ""}</span>
              </div>

              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>{search ? "No files match your search" : "No files yet"}</h3>
                  <p>{!search && (activeTab === "myfiles" ? "Upload your first file to get started" : "Files shared with you will appear here")}</p>
                </div>
              ) : (
                <div className="file-grid">
                  {filtered.map(file => (
                    <FileCard
                      key={file._id}
                      file={file}
                      isShared={activeTab === "shared"}
                      onDelete={deleteFile}
                      onShare={f => setShareTarget(f)}
                      onDownload={downloadFile}
                      onPreview={f => setPreviewTarget(f)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      {shareTarget && (
        <ShareModal
          file={files.find(f => f._id === shareTarget._id) || shareTarget}
          users={users}
          onClose={() => setShareTarget(null)}
          onShare={shareFile}
          onPublicLink={async (id, isPublic) => {
            await togglePublicLink(id, isPublic);
            await getFiles();
            setShareTarget(files.find(f => f._id === id) || shareTarget);
          }}
        />
      )}

      {previewTarget && (
        <PreviewModal file={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default Dashboard;
