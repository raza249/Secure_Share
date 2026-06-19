import { useState } from "react";
import { Link } from "react-router-dom";
import API from "../api";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loginUser = async () => {
    if (!email || !password) { setError("Please fill in all fields"); return; }
    try {
      setLoading(true); setError("");
      const res = await API.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.user.id);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.location.href = "/";
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") loginUser(); };

  return (
    <div className="page-root">
      <div className="aurora-bg"><div className="aurora-orb" /></div>
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="logo-icon">🔒</div>
            <h1>SecureShare</h1>
            <p>Sign in to your secure vault</p>
          </div>

          {error && (
            <div style={{
              padding: "10px 14px", background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10,
              color: "#f87171", fontSize: 14, marginBottom: 12
            }}>
              ⚠️ {error}
            </div>
          )}

          <div className="auth-field">
            <span className="field-icon">📧</span>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <span className="field-icon">🔑</span>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="current-password"
            />
          </div>

          <button className="auth-btn" onClick={loginUser} disabled={loading}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>

          <p className="auth-link">
            No account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;