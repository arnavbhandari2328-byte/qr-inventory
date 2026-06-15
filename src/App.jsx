import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { supabase } from "./supabase.js";

import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Transactions from "./pages/Transactions.jsx";
import Scan from "./pages/Scan.jsx";
import QRPrint from "./pages/QRPrint.jsx";
import Login from "./pages/Login.jsx";
import UpdatePassword from "./pages/UpdatePassword.jsx";
import WarehouseStock from "./pages/WarehouseStock.jsx";
import OfficeStock from "./pages/OfficeStock.jsx";
import LookupPrint from "./pages/LookupPrint.jsx";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/products", label: "Products", icon: "📦" },
  { to: "/transactions", label: "Transactions", icon: "🔄" },
  { to: "/warehouse", label: "Warehouse", icon: "🏭" },
  { to: "/office", label: "Office Stock", icon: "🏢" },
  { to: "/lookup", label: "Lookup & Print", icon: "🔍" },
];

function NavBar({ session, onSignOut }) {
  const location = useLocation();
  if (!session || window.location.href.includes("update-password")) return null;
  return (
    <nav className="bg-gray-900 text-white px-4 py-3 flex justify-between items-center no-print sticky top-0 z-40 shadow-lg">
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {NAV_ITEMS.map(({ to, label, icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              <span>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-3 ml-3 shrink-0">
        <span className="text-xs text-gray-400 hidden lg:block truncate max-w-[160px]">{session.user.email}</span>
        <button
          onClick={onSignOut}
          className="bg-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors whitespace-nowrap"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => checkUser(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setSession(session); setIsAuthorized(true); setLoading(false);
      } else {
        checkUser(session);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function checkUser(currentSession) {
    if (!currentSession) {
      setSession(null); setIsAuthorized(false); setLoading(false); return;
    }
    try {
      const { data } = await supabase
        .from("authorized_employees")
        .select("email")
        .eq("email", currentSession.user.email)
        .single();
      if (data) {
        setSession(currentSession); setIsAuthorized(true);
      } else {
        await supabase.auth.signOut();
        setSession(null); setIsAuthorized(false);
        alert("Access Denied: You are not authorized.");
      }
    } catch {
      setSession(null); setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-bold">
      Verifying Identity...
    </div>
  );

  if (!session && !window.location.href.includes("update-password")) return <Login />;

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {session && isAuthorized && (
          <NavBar session={session} onSignOut={() => supabase.auth.signOut()} />
        )}
        <div className="p-0 md:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/scan/:productId" element={<Scan />} />
            <Route path="/qrprint" element={<QRPrint />} />
            <Route path="/warehouse" element={<WarehouseStock />} />
            <Route path="/office" element={<OfficeStock />} />
            <Route path="/lookup" element={<LookupPrint />} />
            <Route path="/update-password" element={<UpdatePassword />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
