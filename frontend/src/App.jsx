import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import SharePage from "./pages/SharePage";

function App() {
  const token = localStorage.getItem("token");
  return (
    <Routes>
      <Route path="/login"         element={<Login />} />
      <Route path="/signup"        element={<Signup />} />
     
      <Route path="/public/:token" element={<SharePage />} />
      <Route path="/"              element={token ? <Dashboard /> : <Navigate to="/login" />} />
    </Routes>
  );
}

export default App;