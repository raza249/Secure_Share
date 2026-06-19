import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(str) {
  return new Date(str).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function getFileIcon(mimetype = "") {
  if (mimetype.startsWith("image/")) return "🖼️";
  if (mimetype === "application/pdf") return "📄";
  if (mimetype.startsWith("video/")) return "🎬";
  if (mimetype.startsWith("audio/")) return "🎵";
  if (mimetype.includes("word")) return "📝";
  if (mimetype.includes("zip")) return "🗜️";
  return "📁";
}

export default function SharePage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | found | expired | notfound
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    axios.get(`http://localhost:5000/api/files/public-info/${token}`)
      .then(res => { setInfo(res.data); setStatus("found"); })
      .catch(err => {
        if (err.response?.status === 410) setStatus("expired");
        else setStatus("notfound");
      });
  }, [token]);

  const downloadFile = async () => {
    setDownloading(true);
    try {
      const res = await axios.get(`http://localhost:5000/api/files/public/${token}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", info.originalname);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch { alert("Download failed."); }
    setDownloading(false);
  };

  return (
    <div className="page-root">
      <div className="aurora-bg"><div className="aurora-orb" /></div>
      <div className="auth-wrap">
        <div className="auth-card" style={{ maxWidth: 480 }}>

          {status === "loading" && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
              <p>Loading file info…</p>
            </div>
          )}

          {status === "notfound" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
              <h2 style={{ color: "#f1f5f9", marginBottom: 8 }}>Link Not Found</h2>
              <p style={{ color: "#94a3b8" }}>This share link doesn't exist or has been disabled by the owner.</p>
            </div>
          )}

          {status === "expired" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⌛</div>
              <h2 style={{ color: "#f1f5f9", marginBottom: 8 }}>Link Expired</h2>
              <p style={{ color: "#94a3b8" }}>This share link has expired. Ask the owner to generate a new one.</p>
            </div>
          )}

          {status === "found" && info && (
            <>
              <div className="auth-logo">
                <div className="logo-icon" style={{ fontSize: 28 }}>{getFileIcon(info.mimetype)}</div>
                <h1 style={{ fontSize: 20 }}>Shared File</h1>
                <p>Someone shared a file with you via SecureShare</p>
              </div>

              {/* File info card */}
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14,
                padding: "18px 20px",
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 12, wordBreak: "break-all" }}>
                  {info.originalname}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                  {[
                    { label: "Size",      value: formatBytes(info.size) },
                    { label: "Shared by", value: info.owner || "Unknown" },
                    { label: "Uploaded",  value: formatDate(info.createdAt) },
                    { label: "Downloads", value: info.downloadCount || 0 },
                  ].map(row => (
                    <div key={row.label}>
                      <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>
                        {row.label}
                      </div>
                      <div style={{ fontSize: 14, color: "#94a3b8", fontWeight: 500 }}>{row.value}</div>
                    </div>
                  ))}
                </div>
                {info.expiresAt && (
                  <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, fontSize: 12, color: "#fbbf24" }}>
                    ⚠️ Expires {formatDate(info.expiresAt)}
                  </div>
                )}
              </div>

              <button className="auth-btn" onClick={downloadFile} disabled={downloading}>
                {downloading ? "Downloading…" : `⬇️ Download File`}
              </button>

              <p className="auth-link" style={{ marginTop: 16 }}>
                Want to share your own files? <a href="/signup">Create an account</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}