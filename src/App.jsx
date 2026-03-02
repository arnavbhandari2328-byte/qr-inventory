import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { supabase } from "./supabase.js";

import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Transactions from "./pages/Transactions.jsx";
import Scan from "./pages/Scan.jsx";
import QRPrint from "./pages/QRPrint.jsx";
import Login from "./pages/Login.jsx";

// This wrapper component checks if we are on the scan page to bypass login
function AppContent({ session }) {
  const location = useLocation();
  
  // ✅ Check if the current URL starts with /scan
  const isScanPage = location.pathname.startsWith("/scan");

  // If not logged in AND not on the scan page, show Login
  if (!session && !isScanPage) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar - Hidden on Scan page for a clean mobile "App" feel */}
      {!isScanPage && (
        <nav className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center shadow-lg">
          <div className="flex gap-6 overflow-x-auto">
            <Link to="/" className="hover:text-blue-400 whitespace-nowrap">Dashboard</Link>
            <Link to="/products" className="hover:text-blue-400 whitespace-nowrap">Products</Link>
            <Link to="/transactions" className="hover:text-blue-400 whitespace-nowrap">Transactions</Link>
            <Link to="/scan" className="hover:text-blue-400 whitespace-nowrap font-bold text-blue-400">Scan</Link>
            <Link to="/qrprint" className="hover:text-blue-400 whitespace-nowrap">QR Print</Link>
          </div>
          
          <button 
            onClick={() => supabase.auth.signOut()} 
            className="bg-red-600 hover:bg-red-700 px-4 py-1 rounded text-sm font-semibold transition-colors ml-4"
          >
            Logout
          </button>
        </nav>
      )}

      {/* Pages Container - Remove padding on scan page for true edge-to-edge mobile UI */}
      <div className={isScanPage ? "" : "p-6"}>
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
  );
}

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Check active session when the app loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <AppContent session={session} />
    </Router>
  );
}

export default App;