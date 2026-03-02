import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { supabase } from "./supabase.js";

import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Transactions from "./pages/Transactions.jsx";
import Scan from "./pages/Scan.jsx";
import QRPrint from "./pages/QRPrint.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(null); // null = checking, true = ok, false = blocked
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkUser(session);
    });

    // Listen for sign-in/sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkUser(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkUser(currentSession) {
    if (!currentSession) {
      setSession(null);
      setIsAuthorized(false);
      setLoading(false);
      return;
    }

    try {
      // 🛡️ Verify if the email exists in your authorized list
      const { data, error } = await supabase
        .from("authorized_employees")
        .select("email")
        .eq("email", currentSession.user.email)
        .single();

      if (data) {
        setSession(currentSession);
        setIsAuthorized(true);
      } else {
        // Not in the list - Kick them out immediately
        await supabase.auth.signOut();
        setSession(null);
        setIsAuthorized(false);
        alert("Access Denied: You are not authorized to use this system.");
      }
    } catch (err) {
      console.error("Auth check error:", err);
      setSession(null);
      setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  }

  // 1. Show nothing while the initial check is happening
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-bold">
        Verifying Identity...
      </div>
    );
  }

  // 2. If no session or blocked, show Login
  if (!session || !isAuthorized) {
    return <Login />;
  }

  // 3. Render the App for authorized employees
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center no-print">
          <div className="flex gap-6 overflow-x-auto">
            <Link to="/" className="hover:text-blue-400">Dashboard</Link>
            <Link to="/products" className="hover:text-blue-400">Products</Link>
            <Link to="/transactions" className="hover:text-blue-400">Transactions</Link>
            <Link to="/scan" className="hover:text-blue-400 font-bold text-blue-400">Lookup</Link>
            <Link to="/qrprint" className="hover:text-blue-400">QR Print</Link>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 hidden md:block">{session.user.email}</span>
            <button 
              onClick={() => supabase.auth.signOut()} 
              className="bg-red-600 px-4 py-1 rounded text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </nav>

        <div className="p-0 md:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/scan/:productId" element={<Scan />} />
            <Route path="/qrprint" element={<QRPrint />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}