import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api$/, "") + "/api";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function PublicDownload() {
  const { token } = useParams();
  const [info,     setInfo]     = useState(null);
  const [status,   setStatus]   = useState("loading"); // loading | ready | expired | error
  const [downloading, setDownloading] = useState(false);
  const [downloaded,  setDownloaded]  = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/files/public-info/${token}`)
      .then(async res => {
        if (res.status === 410) { setStatus("expired"); return; }
        if (!res.ok)            { setStatus("error");   return; }
        const data = await res.json();
        setInfo(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/files/public/${token}`);
      if (!res.ok) throw new Error("Download failed");
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const link     = document.createElement("a");
      link.href      = url;
      link.download  = info?.originalname || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch {
      setStatus("error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0c0f0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Inter, sans-serif",
      padding: 24,
    }}>
      {/* Aurora blobs */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", width: 600, height: 600, top: -150, left: -150,
          background: "radial-gradient(circle, rgba(217,119,6,0.25) 0%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", width: 500, height: 500, bottom: -100, right: -100,
          background: "radial-gradient(circle, rgba(13,148,136,0.2) 0%, transparent 70%)",
        }} />
      </div>

      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 440,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 24,
        padding: "40px 36px",
        backdropFilter: "blur(20px)",
        textAlign: "center",
      }}>
        {/* Logo */}
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: "0 auto 20px",
          background: "linear-gradient(135deg, #d97706, #0d9488)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24,
        }}>🔒</div>

        <h2 style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: "0 0 6px",
        }}>SecureShare</h2>

        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 32px" }}>
          Secure file sharing
        </p>

        {/* Loading */}
        {status === "loading" && (
          <div style={{ color: "#94a3b8", fontSize: 15 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            Fetching file info…
          </div>
        )}

        {/* Expired */}
        {status === "expired" && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
            <h3 style={{ color: "#fb7185", fontSize: 18, margin: "0 0 8px" }}>Link Expired</h3>
            <p style={{ color: "#64748b", fontSize: 14 }}>This public link has expired and is no longer valid.</p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
            <h3 style={{ color: "#fb7185", fontSize: 18, margin: "0 0 8px" }}>Link Not Found</h3>
            <p style={{ color: "#64748b", fontSize: 14 }}>This link is invalid or has been disabled by the owner.</p>
          </div>
        )}

        {/* Ready */}
        {status === "ready" && info && (
          <div>
            {/* File icon */}
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px",
              background: "rgba(217,119,6,0.15)",
              border: "1px solid rgba(217,119,6,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28,
            }}>📄</div>

            <h3 style={{
              color: "#f1f5f9", fontSize: 16, fontWeight: 600,
              margin: "0 0 8px", wordBreak: "break-all",
            }}>{info.originalname}</h3>

            {/* Meta */}
            <div style={{
              display: "flex", gap: 12, justifyContent: "center",
              flexWrap: "wrap", margin: "0 0 28px",
            }}>
              {[
                { label: formatBytes(info.size) },
                { label: `Shared by ${info.owner || "Unknown"}` },
                info.downloadCount > 0 && { label: `${info.downloadCount} downloads` },
                info.expiresAt && { label: `Expires ${new Date(info.expiresAt).toLocaleDateString()}` },
              ].filter(Boolean).map((m, i) => (
                <span key={i} style={{
                  padding: "4px 10px", borderRadius: 999, fontSize: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#94a3b8",
                }}>{m.label}</span>
              ))}
            </div>

            {/* Download button */}
            {!downloaded ? (
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  width: "100%", padding: "14px",
                  background: downloading
                    ? "rgba(255,255,255,0.06)"
                    : "linear-gradient(135deg, #d97706, #0d9488)",
                  border: "none", borderRadius: 10,
                  color: "#fff", fontSize: 15, fontWeight: 600,
                  cursor: downloading ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {downloading ? "⏳ Downloading…" : "⬇️ Download File"}
              </button>
            ) : (
              <div style={{
                padding: "14px",
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.3)",
                borderRadius: 10, color: "#34d399", fontSize: 15, fontWeight: 600,
              }}>
                ✅ Download started!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
