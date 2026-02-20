import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { supabase } from "./supabase.js";

import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Transactions from "./pages/Transactions.jsx";
import Scan from "./pages/Scan.jsx";
import QRPrint from "./pages/QRPrint.jsx";
import Login from "./pages/Login.jsx";

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

  // If there is no session, ONLY render the Login page
  if (!session) {
    return <Login />;
  }

  // If logged in, render the main app
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">

        {/* Navbar */}
        <nav className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex gap-6">
            <Link to="/" className="hover:text-blue-400">Dashboard</Link>
            <Link to="/products" className="hover:text-blue-400">Products</Link>
            <Link to="/transactions" className="hover:text-blue-400">Transactions</Link>
            <Link to="/scan" className="hover:text-blue-400">Scan</Link>
            <Link to="/qrprint" className="hover:text-blue-400">QR Print</Link>
          </div>
          
          {/* Logout Button */}
          <button 
            onClick={() => supabase.auth.signOut()} 
            className="bg-red-600 hover:bg-red-700 px-4 py-1 rounded text-sm font-semibold transition-colors"
          >
            Logout
          </button>
        </nav>

        {/* Pages */}
        <div className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/scan/:productId" element={<Scan />} />
            <Route path="/qrprint" element={<QRPrint />} />
          </Routes>
        </div>

      </div>
    </Router>
  );
}

export default App;