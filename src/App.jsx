import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Transactions from "./pages/Transactions.jsx";
import Scan from "./pages/Scan.jsx";
import QRPrint from "./pages/QRPrint.jsx";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">

        {/* Navbar */}
        <nav className="bg-gray-900 text-white px-6 py-4 flex gap-6">
          <Link to="/" className="hover:text-blue-400">Dashboard</Link>
          <Link to="/products" className="hover:text-blue-400">Products</Link>
          <Link to="/transactions" className="hover:text-blue-400">Transactions</Link>
          <Link to="/scan" className="hover:text-blue-400">Scan</Link>
          <Link to="/qrprint" className="hover:text-blue-400">QR Print</Link>
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
