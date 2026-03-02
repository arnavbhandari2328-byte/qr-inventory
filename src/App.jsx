import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { supabase } from "./supabase.js";

import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Transactions from "./pages/Transactions.jsx";
import Scan from "./pages/Scan.jsx";
import QRPrint from "./pages/QRPrint.jsx";
import Login from "./pages/Login.jsx";
import UpdatePassword from "./pages/UpdatePassword.jsx"; // ✅ New Import

export default function App() {
  const [session, setSession] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(null); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkUser(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // ✅ Allow the app to stay on the Update Password page if that's the event
      if (event === "PASSWORD_RECOVERY") {
        setSession(session);
        setIsAuthorized(true);
        setLoading(false);
      } else {
        checkUser(session);
      }
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
      const { data, error } = await supabase
        .from("authorized_employees")
        .select("email")
        .eq("email", currentSession.user.email)
        .single();

      if (data) {
        setSession(currentSession);
        setIsAuthorized(true);
      } else {
        await supabase.auth.signOut();
        setSession(null);
        setIsAuthorized(false);
        alert("Access Denied: You are not authorized.");
      }
    } catch (err) {
      setSession(null);
      setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-bold">
        Verifying Identity...
      </div>
    );
  }

  // ✅ Show Login ONLY if there is no session OR the user isn't on the update-password page
  if (!session && !window.location.href.includes("update-password")) {
    return <Login />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {/* Only show Nav if authorized and NOT on the password update screen */}
        {session && isAuthorized && !window.location.href.includes("update-password") && (
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
        )}

        <div className="p-0 md:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/scan/:productId" element={<Scan />} />
            <Route path="/qrprint" element={<QRPrint />} />
            <Route path="/update-password" element={<UpdatePassword />} /> {/* ✅ New Route */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}