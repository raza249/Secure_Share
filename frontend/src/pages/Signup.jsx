import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../api";

function Signup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signupUser = async () => {
    if (!username || !email || !password) { setError("All fields required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    try {
      setLoading(true); setError("");
      await API.post("/auth/signup", { username, email, password });
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") signupUser(); };

  return (
    <div className="page-root">
      <div className="aurora-bg"><div className="aurora-orb" /></div>
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="logo-icon">🛡️</div>
            <h1>Create Account</h1>
            <p>Join SecureShare today</p>
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
            <span className="field-icon">👤</span>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          <div className="auth-field">
            <span className="field-icon">📧</span>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          <div className="auth-field">
            <span className="field-icon">🔑</span>
            <input
              type="password"
              placeholder="Password (min. 6 chars)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          <button className="auth-btn" onClick={signupUser} disabled={loading}>
            {loading ? "Creating account…" : "Create Account →"}
          </button>

          <p className="auth-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;