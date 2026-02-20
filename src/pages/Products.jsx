import { useEffect, useState } from "react";
import { getProducts, getTransactions } from "../api/api";
import * as XLSX from "xlsx";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    product_id: "",
    product_name: "",
    low_stock_alert: "",
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [ledger, setLedger] = useState([]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const prod = await getProducts();
      const trans = await getTransactions();
      setProducts(prod || []);
      setTransactions(trans || []);
    } catch (err) {
      console.error("Failed loading products", err);
    }
  };

  /* ---------------- STOCK CALCULATOR ---------------- */
  const stockByLocation = (productId, locationName) => {
    const related = transactions.filter(
      (t) =>
        String(t.product_id) === String(productId) &&
        (t.location_name || "").toLowerCase() === locationName.toLowerCase()
    );

    let stock = 0;
    related.forEach((t) => {
      if (t.transaction_type === "inward") stock += Number(t.quantity);
      else stock -= Number(t.quantity);
    });

    return stock;
  };

  const openLedger = (product) => {
    setSelectedProduct(product);

    const filtered = transactions
      .filter((t) => String(t.product_id) === String(product.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let balance = 0;
    const calculated = filtered.map((t) => {
      if (t.transaction_type === "inward") balance += Number(t.quantity);
      else balance -= Number(t.quantity);
      return { ...t, balance };
    });

    setLedger(calculated);
  };

  /* ---------------- EXPORT EXCEL ---------------- */
  const handleExportExcel = () => {
    if (!products.length) return;

    const data = products.map((p) => ({
      Product_ID: p.product_id,
      Product_Name: p.product_name,
      Office: stockByLocation(p.id, "Office"),
      Godown: stockByLocation(p.id, "Godown"),
      Warehouse: stockByLocation(p.id, "Warehouse"),
      Low_Alert: p.low_stock_alert,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Products_Report.xlsx");
  };

  /* ---------------- ADD PRODUCT ---------------- */
  const handleAddProduct = async () => {
    if (!form.product_id || !form.product_name || !form.low_stock_alert) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const API_URL = import.meta.env.VITE_API_URL;
      await fetch(`${API_URL}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: form.product_id,
          product_name: form.product_name,
          low_stock_alert: Number(form.low_stock_alert)
        }),
      });

      // Clear the form and refresh the table
      setForm({ product_id: "", product_name: "", low_stock_alert: "" });
      loadProducts(); 
    } catch (err) {
      console.error("Failed to add product", err);
    }
  };

  /* ---------------- DELETE PRODUCT ---------------- */
  const handleDeleteProduct = async (e, productId) => {
    e.stopPropagation(); // Prevents the row's onClick (openLedger) from firing

    if (!window.confirm("Are you sure you want to delete this product?")) return;

    try {
      const API_URL = import.meta.env.VITE_API_URL;
      await fetch(`${API_URL}/products/${productId}`, {
        method: "DELETE",
      });
      loadProducts(); // Refresh the table after deleting
    } catch (err) {
      console.error("Failed to delete product", err);
    }
  };

  const filtered = products.filter(
    (p) =>
      p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.product_id?.toLowerCase().includes(search.toLowerCase())
  );

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Products</h1>

      <div className="bg-white shadow rounded p-4 mb-6 flex gap-3 items-center">
        <input name="product_id" placeholder="Product ID" value={form.product_id} onChange={handleChange} className="border p-2 rounded w-1/4" />
        <input name="product_name" placeholder="Product Name" value={form.product_name} onChange={handleChange} className="border p-2 rounded w-1/4" />
        <input name="low_stock_alert" placeholder="Low Stock Alert" type="number" value={form.low_stock_alert} onChange={handleChange} className="border p-2 rounded w-1/4" />
        <button onClick={handleAddProduct} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded">Add</button>
        <button onClick={handleExportExcel} className="ml-auto bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded">Export Excel</button>
      </div>

      <input placeholder="Search by ID or Name..." value={search} onChange={(e) => setSearch(e.target.value)} className="border p-2 rounded w-full mb-4" />

      <div className="bg-white shadow rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr className="text-left text-gray-700">
              <th className="p-3">Product ID</th>
              <th className="p-3">Product Name</th>
              <th className="p-3">Office</th>
              <th className="p-3">Godown</th>
              <th className="p-3">Warehouse</th>
              <th className="p-3">Low Alert</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="7" className="p-4 text-gray-500">No products found</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-b hover:bg-blue-50 cursor-pointer" onClick={() => openLedger(p)}>
                  <td className="p-3 font-medium">{p.product_id}</td>
                  <td className="p-3">{p.product_name}</td>
                  <td className="p-3 font-semibold text-blue-600">{stockByLocation(p.id, "Office")}</td>
                  <td className="p-3 font-semibold text-purple-600">{stockByLocation(p.id, "Godown")}</td>
                  <td className="p-3 font-semibold text-green-600">{stockByLocation(p.id, "Warehouse")}</td>
                  <td className="p-3">
                    <span className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-sm font-semibold">
                      {p.low_stock_alert}
                    </span>
                  </td>
                  <td className="p-3">
                    <button 
                      onClick={(e) => handleDeleteProduct(e, p.product_id)} 
                      className="text-red-500 hover:text-red-700 font-semibold px-3 py-1 bg-red-50 rounded hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-4/5 max-h-[85vh] overflow-y-auto rounded-lg shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Ledger — {selectedProduct.product_name}</h2>
              <button onClick={() => setSelectedProduct(null)} className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600 transition-colors">Close</button>
            </div>

            <table className="w-full border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border">Date</th>
                  <th className="p-2 border">Type</th>
                  <th className="p-2 border">Qty</th>
                  <th className="p-2 border">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr><td colSpan="4" className="p-4 text-gray-500 text-center">No transactions</td></tr>
                ) : ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="border p-2">{new Date(l.created_at).toLocaleString()}</td>
                    <td className={`border p-2 font-semibold ${l.transaction_type === "inward" ? "text-green-600" : "text-red-600"}`}>{l.transaction_type}</td>
                    <td className="border p-2">{l.quantity}</td>
                    <td className="border p-2 font-bold">{l.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}