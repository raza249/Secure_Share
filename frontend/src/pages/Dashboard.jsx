import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import API from "../api";

// ── Line ~5 (after imports) ───────────────────────────────────


// REPLACE with these two lines:
const BASE_URL = (import.meta.env.VITE_API_URL || import.meta.env.VITE_SOCKET_URL || "http://localhost:5000").replace(/\/api$/, "");
const API_BASE = `${BASE_URL}/api`;

const socket = io(BASE_URL, {
  auth: { token: localStorage.getItem("token") },
  transports: ["websocket", "polling"],
});

// ─── Allowed file types (expanded — code files included) ─────
const ALLOWED_EXTENSIONS = [
  // documents
  "pdf","doc","docx","xls","xlsx","ppt","pptx","txt","rtf","odt","csv",
  // images
  "jpg","jpeg","png","gif","bmp","webp","svg","ico","tiff",
  // video
  "mp4","mkv","mov","avi","wmv","webm","flv",
  // audio
  "mp3","wav","ogg","flac","aac","m4a",
  // code
  "py","java","js","jsx","ts","tsx","html","htm","css","scss","sass",
  "c","cpp","h","cs","go","rb","php","swift","kt","rs","sh","bash",
  "json","xml","yaml","yml","toml","ini","env","md","sql","r","m",
  "vue","svelte","dart","lua","pl","scala","hs","ex","exs","clj",
  // archives
  "zip","rar","tar","gz","7z","bz2",
  // misc
  "log","config","lock","gitignore","dockerfile","makefile",
];

const MAX_SIZE_MB = 50;

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

function getExt(name = "") {
  return name.split(".").pop().toLowerCase();
}

// Extended file type detection — handles code files, unknown mimes
function getFileIcon(file) {
  const mime = file.mimetype || "";
  const ext  = getExt(file.originalname);

  if (mime.startsWith("image/"))  return { icon: "🖼️", cls: "type-image" };
  if (mime === "application/pdf") return { icon: "📄", cls: "type-pdf" };
  if (mime.startsWith("video/"))  return { icon: "🎬", cls: "type-video" };
  if (mime.startsWith("audio/"))  return { icon: "🎵", cls: "type-doc" };
  if (mime.includes("word") || mime.includes("document")) return { icon: "📝", cls: "type-doc" };
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("tar"))
    return { icon: "🗜️", cls: "type-zip" };
  if (mime.startsWith("text/"))   return { icon: "📃", cls: "type-doc" };

  // Code file detection by extension when mime is octet-stream / unknown
  const codeExts = ["py","java","js","jsx","ts","tsx","html","htm","css","scss",
    "c","cpp","h","cs","go","rb","php","swift","kt","rs","sh","bash",
    "sql","r","m","vue","svelte","dart","lua","pl","scala","hs","ex","exs","clj"];
  if (codeExts.includes(ext)) return { icon: "💻", cls: "type-doc" };

  const docExts = ["json","xml","yaml","yml","toml","ini","md","env","log","config","gitignore","makefile","dockerfile"];
  if (docExts.includes(ext)) return { icon: "📋", cls: "type-doc" };

  return { icon: "📁", cls: "type-other" };
}

// Determine if we can show a preview in the browser
function canPreview(file) {
  const mime = file.mimetype || "";
  const ext  = getExt(file.originalname);

  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  // text/* covers text/plain, text/html, text/css etc.
  if (mime.startsWith("text/")) return "text";

  // octet-stream code/text files — detect by extension
  const textExts = ["py","java","js","jsx","ts","tsx","html","htm","css","scss","sass",
    "c","cpp","h","cs","go","rb","php","swift","kt","rs","sh","bash",
    "json","xml","yaml","yml","toml","ini","md","sql","r","log","config",
    "gitignore","env","makefile","dockerfile","txt","rtf","csv","vue",
    "svelte","dart","lua","pl","scala","hs","ex","exs","clj","lock"];
  if (textExts.includes(ext)) return "text";

  return null; // not previewable
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
  const token      = localStorage.getItem("token");
  const previewUrl = `${API_BASE}/files/preview/${file._id}`;
  const [blobUrl,  setBlobUrl]  = useState(null);
  const [content,  setContent]  = useState("");   // for text files
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const blobRef = useRef(null);

  const pType = canPreview(file);

  useEffect(() => {
    if (!pType) { setLoading(false); return; }

    fetch(previewUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const blob = await res.blob();

        if (pType === "text") {
          // Read text files as string so we can display with syntax highlighting
          const text = await blob.text();
          setContent(text);
        } else {
          const url = URL.createObjectURL(blob);
          blobRef.current = url;
          setBlobUrl(url);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file._id]);

  const ext = getExt(file.originalname);

  const renderContent = () => {
    if (loading) return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <p>Loading preview…</p>
      </div>
    );
    if (error) return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: "#fb7185" }}>Preview failed: {error}</p>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
          Try downloading the file instead.
        </p>
      </div>
    );

    if (pType === "image")
      return <img src={blobUrl} alt={file.originalname}
        style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain", borderRadius: 12 }} />;

    if (pType === "pdf")
      return <iframe src={blobUrl} style={{ width: "100%", height: "65vh", border: "none", borderRadius: 12 }}
        title="PDF Preview" />;

    if (pType === "video")
      return <video src={blobUrl} controls
        style={{ width: "100%", maxHeight: "65vh", borderRadius: 12 }} />;

    if (pType === "audio")
      return <audio src={blobUrl} controls style={{ width: "100%", marginTop: 20 }} />;

    if (pType === "text")
      return (
        <div style={{
          background: "#0c0f0a", borderRadius: 10, padding: "16px 20px",
          maxHeight: "65vh", overflowY: "auto", textAlign: "left",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12, paddingBottom: 10,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
              .{ext} — {formatBytes(file.size)} — {content.split("\n").length} lines
            </span>
            <button className="btn btn-ghost btn-sm"
              onClick={() => navigator.clipboard.writeText(content)}>
              📋 Copy
            </button>
          </div>
          <pre style={{
            fontFamily: "'Fira Code', 'Consolas', monospace",
            fontSize: 13, lineHeight: 1.65,
            color: "#e2e8f0", whiteSpace: "pre-wrap", wordBreak: "break-word",
            margin: 0,
          }}>
            {content}
          </pre>
        </div>
      );

    return <p style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>
      Preview not available for this file type.
    </p>;
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 860, width: "95vw" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0 }}>👁️ Preview</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>{file.originalname}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{
          background: "rgba(0,0,0,0.4)", borderRadius: 12,
          padding: pType === "text" ? 0 : 16,
          minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
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
  const [receiver,      setReceiver]      = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [copied,        setCopied]        = useState(false);

  // Build the public URL — uses the current origin so it works on any deployment
  const publicUrl = file.publicToken
    ? `${window.location.origin}/public/${file.publicToken}`
    : null;

  const handlePublicLink = async () => {
    setPublicLoading(true);
    await onPublicLink(file._id, file.isPublic);
    setPublicLoading(false);
  };

  const copyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>📤 Share File</h3>
        <p style={{ marginBottom: 20 }}>
          Sharing: <strong style={{ color: "#fff" }}>{file.originalname}</strong>
        </p>

        {/* User-to-user share */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: 1, color: "#64748b", marginBottom: 8 }}>
            Share with a User
          </div>
          <select className="modal-select" value={receiver}
            onChange={e => setReceiver(e.target.value)}>
            <option value="">Select a user…</option>
            {users.map(u => (
              <option key={u._id} value={u.email}>
                {u.username} ({u.email})
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={!receiver}
            onClick={() => { onShare(file._id, receiver); onClose(); }}>
            Send to User
          </button>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "20px 0" }} />

        {/* Public link */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: 1, color: "#64748b", marginBottom: 8 }}>
            🌐 Public Link
          </div>
          {file.isPublic && publicUrl ? (
            <div>
              <div style={{
                padding: "10px 14px",
                background: "rgba(13,148,136,0.1)",
                border: "1px solid rgba(13,148,136,0.3)",
                borderRadius: 10,
                fontSize: 12,
                color: "#2dd4bf",
                marginBottom: 10,
                wordBreak: "break-all",
                fontFamily: "monospace",
              }}>
                {publicUrl}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={copyLink}>
                  {copied ? "✅ Copied!" : "📋 Copy Link"}
                </button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                  onClick={handlePublicLink} disabled={publicLoading}>
                  {publicLoading ? "…" : "🚫 Disable"}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ width: "100%" }}
              onClick={handlePublicLink} disabled={publicLoading}>
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

// ─── Activity Log ─────────────────────────────────────────────
const ACTION_META = {
  uploaded:      { icon: "⬆️", label: "Uploaded",    color: "#fbbf24" },
  downloaded:    { icon: "⬇️", label: "Downloaded",  color: "#2dd4bf" },
  shared:        { icon: "📤", label: "Shared",       color: "#a78bfa" },
  deleted:       { icon: "🗑️", label: "Deleted",     color: "#fb7185" },
  previewed:     { icon: "👁️", label: "Previewed",   color: "#67e8f9" },
  public_shared: { icon: "🌐", label: "Public link",  color: "#fbbf24" },
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
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: `${meta.color}18`,
              border: `1px solid ${meta.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>
              {meta.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>
                  {meta.label}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                  background: `${meta.color}18`, color: meta.color,
                  border: `1px solid ${meta.color}30`,
                }}>
                  {log.action}
                </span>
              </div>
              <div style={{
                fontSize: 13, color: "#64748b", marginTop: 3,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {log.fileName || "Unknown file"}
                {log.targetUser && ` → ${log.targetUser.username}`}
              </div>
            </div>
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
  const { icon, cls } = getFileIcon(file);
  const pType = canPreview(file);

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
        {pType && (
          <button className="btn btn-ghost btn-sm" onClick={() => onPreview(file)}>
            👁️ Preview
          </button>
        )}
        <button className="btn btn-ghost btn-sm"
          onClick={() => onDownload(file._id, file.originalname)}>
          ⬇️ Download
        </button>
        {!isShared && (
          <>
            <button className="btn btn-sm"
              style={{
                background: "rgba(13,148,136,0.15)",
                border: "1px solid rgba(13,148,136,0.3)",
                color: "#2dd4bf",
              }}
              onClick={() => onShare(file)}>
              📤 Share
            </button>
            <button className="btn btn-danger btn-sm"
              onClick={() => onDelete(file._id)}>🗑️</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Upload Tab ────────────────────────────────────────────────
function UploadTab({ onUpload }) {
  const fileRef      = useRef();
  const [selected,   setSelected]   = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [dragging,   setDragging]   = useState(false);
  const [error,      setError]      = useState("");
  const { show: toast } = useToast();

  const validate = (f) => {
    if (!f) return "No file selected.";
    const ext = getExt(f.name);
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return `File too large — max ${MAX_SIZE_MB} MB.`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) return `".${ext}" files are not allowed.`;
    return null;
  };

  const doUpload = async (f) => {
    const err = validate(f);
    if (err) { setError(err); return; }
    setError("");
    const formData = new FormData();
    formData.append("file", f);
    try {
      setUploading(true); setProgress(0);
      await API.post("/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: e => setProgress(Math.round((e.loaded * 100) / e.total)),
      });
      setSelected(null);
      if (fileRef.current) fileRef.current.value = "";
      onUpload();
      toast("File uploaded!", "success");
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || "Upload failed. Check server logs.");
    } finally { setUploading(false); setProgress(0); }
  };

  return (
    <div className="fade-up-delay-1">
      <div
        className={`upload-zone ${dragging ? "dragging" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) { setSelected(f); doUpload(f); }
        }}
      >
        <input
          ref={fileRef}
          type="file"
          // Accept everything — server decides what's truly allowed
          accept="*/*"
          onChange={e => setSelected(e.target.files[0])}
        />
        <div className="upload-zone-icon">☁️</div>
        <h3>{selected ? selected.name : "Drop your file here"}</h3>
        <p>{selected ? formatBytes(selected.size) : `or click to browse — max ${MAX_SIZE_MB} MB`}</p>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
          Supports: images, PDFs, videos, audio, code (.py .java .js .ts .go…), docs, archives
        </p>
        {uploading && (
          <div className="progress-wrap" style={{ marginTop: 16, maxWidth: 400, margin: "16px auto 0" }}>
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {error && (
        <div style={{
          margin: "12px auto", maxWidth: 460, padding: "12px 16px",
          background: "rgba(251,113,133,0.1)", border: "1px solid rgba(251,113,133,0.3)",
          borderRadius: 10, color: "#fb7185", fontSize: 14, textAlign: "center",
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginTop: 16, gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={() => doUpload(selected || fileRef.current?.files[0])}
          disabled={uploading}
        >
          {uploading ? `Uploading ${progress}%…` : "⬆️ Upload File"}
        </button>
        {selected && !uploading && (
          <button className="btn btn-ghost"
            onClick={() => { setSelected(null); setError(""); if (fileRef.current) fileRef.current.value = ""; }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Allowed types reference */}
      <div style={{
        marginTop: 32, padding: "16px 20px",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 1, color: "#64748b", marginBottom: 10 }}>
          Allowed file types
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["Images","PDFs","Videos","Audio","Python .py","Java .java","JavaScript .js / .jsx",
            "TypeScript .ts / .tsx","Go .go","Rust .rs","C/C++ .c .cpp","C# .cs",
            "Ruby .rb","PHP .php","Swift .swift","Kotlin .kt","Shell .sh",
            "HTML .html","CSS .css / .scss","JSON / YAML / TOML","SQL .sql",
            "Markdown .md","Archives .zip .rar","Docs .docx .xlsx"].map(t => (
            <span key={t} style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 12,
              background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.25)",
              color: "#fbbf24",
            }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────
function Dashboard() {
  const [activeTab,       setActiveTab]       = useState("myfiles");
  const [files,           setFiles]           = useState([]);
  const [receivedFiles,   setReceivedFiles]   = useState([]);
  const [users,           setUsers]           = useState([]);
  const [activityLogs,    setActivityLogs]    = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [search,          setSearch]          = useState("");
  const [shareTarget,     setShareTarget]     = useState(null);
  const [previewTarget,   setPreviewTarget]   = useState(null);
  const { toasts, show: toast } = useToast();

  const getFiles         = async () => { try { const r = await API.get("/files");          setFiles(r.data);         } catch {} };
  const getReceivedFiles = async () => { try { const r = await API.get("/files/received"); setReceivedFiles(r.data); } catch {} };
  const getUsers         = async () => { try { const r = await API.get("/users");          setUsers(r.data);         } catch {} };
  const getActivity      = async () => {
    setActivityLoading(true);
    try { const r = await API.get("/files/activity"); setActivityLogs(r.data); } catch {}
    setActivityLoading(false);
  };

  useEffect(() => {
    getFiles(); getReceivedFiles(); getUsers();
    const uid = localStorage.getItem("userId");
    if (uid) socket.emit("join-room", uid);
    socket.on("file-uploaded", getFiles);
    socket.on("file-shared", () => { getReceivedFiles(); toast("📨 A file was shared with you!", "info"); });
    return () => { socket.off("file-uploaded"); socket.off("file-shared"); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "activity") getActivity();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Download — uses fetch + auth header, then triggers browser save ──
  const downloadFile = async (id, originalname) => {
    try {
      const token = localStorage.getItem("token");
       const res = await fetch(`${API_BASE}/files/download/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const blob    = await res.blob();
      const url     = URL.createObjectURL(blob);
      const link    = document.createElement("a");
      link.href     = url;
      link.download = originalname;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast("Download started!", "success");
      getFiles(); // refresh download count
    } catch (e) {
      toast(`Download failed: ${e.message}`, "error");
    }
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

  // After toggling public link, refresh files then update shareTarget so modal shows new token
  const togglePublicLink = async (fileId, isCurrentlyPublic) => {
    try {
      await API.post(`/files/public-link/${fileId}`);
      toast(isCurrentlyPublic ? "Public link disabled" : "Public link generated!", "success");
      await getFiles();
    } catch (err) {
      toast(err.response?.data?.message || "Failed to toggle link", "error");
    }
  };

  const deleteFile = async (id) => {
    if (!window.confirm("Delete this file permanently?")) return;
    try {
      await API.delete(`/files/${id}`);
      getFiles();
      toast("File deleted", "info");
    } catch { toast("Delete failed", "error"); }
  };

  const logout = () => { localStorage.clear(); window.location.href = "/login"; };

  const allFiles = activeTab === "myfiles" ? files : receivedFiles;
  const filtered = allFiles.filter(f =>
    f.originalname?.toLowerCase().includes(search.toLowerCase())
  );

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  // When files refresh, keep shareTarget in sync so public token shows immediately
  useEffect(() => {
    if (shareTarget) {
      const updated = files.find(f => f._id === shareTarget._id);
      if (updated) setShareTarget(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const navItems = [
    { id: "myfiles",  icon: "📁", label: "My Files",       count: files.length },
    { id: "shared",   icon: "📨", label: "Shared With Me", count: receivedFiles.length },
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
            <button
              key={nav.id}
              className={`nav-item ${activeTab === nav.id ? "active" : ""}`}
              onClick={() => setActiveTab(nav.id)}
            >
              <span className="nav-icon">{nav.icon}</span>
              {nav.label}
              {nav.count !== undefined && (
                <span style={{
                  marginLeft: "auto", fontSize: 11,
                  background: "rgba(255,255,255,0.08)",
                  padding: "2px 8px", borderRadius: 999,
                }}>
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
                <span>{storedUser.email || ""}</span>
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
              {activeTab === "upload"   && `Upload any file to your secure vault — max ${MAX_SIZE_MB} MB`}
              {activeTab === "activity" && "Every action on your files, tracked in real time"}
            </p>
          </div>

          {/* Stats */}
          {activeTab === "myfiles" && (
            <div className="stats-row">
              {[
                { icon: "📁", label: "Total Files",  value: files.length,           cls: "purple" },
                { icon: "📨", label: "Received",      value: receivedFiles.length,  cls: "cyan"   },
                { icon: "💾", label: "Storage Used",  value: formatBytes(totalSize), cls: "green"  },
              ].map(s => (
                <div key={s.label} className="stat-card fade-up-delay-1">
                  <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                  <div className="stat-info"><p>{s.value}</p><span>{s.label}</span></div>
                </div>
              ))}
            </div>
          )}

          {/* Upload */}
          {activeTab === "upload" && (
            <UploadTab onUpload={() => { getFiles(); setActiveTab("myfiles"); }} />
          )}

          {/* Activity */}
          {activeTab === "activity" && (
            <ActivityLogTab logs={activityLogs} loading={activityLoading} />
          )}

          {/* File lists */}
          {(activeTab === "myfiles" || activeTab === "shared") && (
            <>
              <div className="search-bar fade-up-delay-1">
                <span className="search-icon">🔍</span>
                <input
                  placeholder="Search files…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="section-heading">
                <h2>{activeTab === "myfiles" ? "My Files" : "Shared With Me"}</h2>
                <span>{filtered.length} file{filtered.length !== 1 ? "s" : ""}</span>
              </div>

              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>{search ? "No files match your search" : "No files yet"}</h3>
                  <p>
                    {!search && (activeTab === "myfiles"
                      ? "Upload your first file to get started"
                      : "Files shared with you will appear here")}
                  </p>
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
          file={shareTarget}
          users={users}
          onClose={() => setShareTarget(null)}
          onShare={shareFile}
          onPublicLink={togglePublicLink}
        />
      )}

      {previewTarget && (
        <PreviewModal
          file={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      <ToastContainer toasts={toasts} />
       <nav className="mobile-bottom-nav">
        {navItems.map(nav => (
          <button
            key={nav.id}
            className={`mob-nav-item ${activeTab === nav.id ? "active" : ""}`}
            onClick={() => setActiveTab(nav.id)}
          >
            <span className="mob-icon">{nav.icon}</span>
            <span>{nav.label}</span>
            {nav.count !== undefined && nav.count > 0 && (
              <span className="mob-badge">{nav.count}</span>
            )}
          </button>
        ))}
      </nav>
      <button className="mob-signout" onClick={logout}>
        🚪 Sign Out
      </button>
    </div>
  );
}

export default Dashboard;
