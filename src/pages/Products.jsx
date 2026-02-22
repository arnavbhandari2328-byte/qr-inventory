import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [locations, setLocations] = useState([]); // ✅ Needs locations to map Excel text to DB IDs
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    product_id: "",
    product_name: "",
    low_stock_alert: "",
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  // ✅ Ref for the hidden file input
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const { data: prod, error: prodErr } = await supabase.from("products").select("*");
      const { data: trans, error: transErr } = await supabase.from("transactions").select("*, locations(name)");
      const { data: loc, error: locErr } = await supabase.from("locations").select("*");

      if (prodErr) throw prodErr;
      if (transErr) throw transErr;
      if (locErr) throw locErr;

      const formattedTrans = (trans || []).map(t => ({
        ...t,
        location_name: t.locations?.name || ""
      }));

      setProducts(prod || []);
      setTransactions(formattedTrans);
      setLocations(loc || []);
    } catch (err) {
      console.error("Failed loading data from Supabase:", err.message);
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

  /* ---------------- BULK UPLOAD EXCEL W/ OPENING STOCK ---------------- */
  const handleBulkUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);

        // 1. Prepare products for insertion
        const productsToInsert = [];
        const validRows = []; // Keep track of valid rows to process stock later

        data.forEach((row) => {
          const pId = String(row.Product_ID || row.product_id || "");
          const pName = String(row.Product_Name || row.product_name || "");
          
          if (pId && pName) {
            productsToInsert.push({
              product_id: pId,
              product_name: pName,
              low_stock_alert: Number(row.Low_Alert || row.low_stock_alert || 0)
            });
            validRows.push(row);
          }
        });

        if (productsToInsert.length === 0) {
          alert("No valid data found. Ensure headers are 'Product_ID' and 'Product_Name'.");
          return;
        }

        // 2. Insert Products and get them back (so we have their internal DB IDs)
        const { data: insertedProducts, error: prodErr } = await supabase
          .from("products")
          .insert(productsToInsert)
          .select("*"); 

        if (prodErr) throw prodErr;

        // 3. Prepare Opening Stock Transactions
        const transactionsToInsert = [];

        validRows.forEach((row) => {
          const stock = Number(row.Opening_Stock || row.opening_stock || 0);
          const locName = String(row.Location || row.location || "").trim();

          // If there is opening stock and a location provided
          if (stock > 0 && locName) {
            // Match the Excel Product_ID to the newly generated DB Product ID
            const pIdStr = String(row.Product_ID || row.product_id);
            const dbProduct = insertedProducts.find(p => p.product_id === pIdStr);
            
            // Match the Excel Location string to the internal DB Location ID
            const dbLocation = locations.find(l => l.name.toLowerCase() === locName.toLowerCase());

            if (dbProduct && dbLocation) {
              transactionsToInsert.push({
                product_id: dbProduct.id, // The internal UUID
                location_id: dbLocation.id, // The internal UUID
                transaction_type: "inward",
                quantity: stock,
                party: "Opening Balance"
              });
            } else if (!dbLocation) {
              console.warn(`Location '${locName}' not found in database. Skipping opening stock for ${pIdStr}.`);
            }
          }
        });

        // 4. Insert Transactions (if any exist)
        if (transactionsToInsert.length > 0) {
          const { error: transErr } = await supabase
            .from("transactions")
            .insert(transactionsToInsert);
          
          if (transErr) throw transErr;
        }

        alert(`Success! Uploaded ${insertedProducts.length} products and created ${transactionsToInsert.length} Opening Stock records.`);
        loadProducts(); // Refresh table to show everything
      } catch (err) {
        console.error("Bulk upload error:", err.message);
        alert(`Upload Failed: ${err.message}. Ensure your Product IDs are unique and don't already exist in the system.`);
      } finally {
        e.target.value = null; // Reset file input
      }
    };
    reader.readAsBinaryString(file);
  };

  /* ---------------- SAVE PRODUCT (ADD OR UPDATE) ---------------- */
  const handleSaveProduct = async () => {
    if (!form.product_id || !form.product_name || !form.low_stock_alert) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase.from("products").update({
          product_id: form.product_id,
          product_name: form.product_name,
          low_stock_alert: Number(form.low_stock_alert)
        }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert([{
          product_id: form.product_id,
          product_name: form.product_name,
          low_stock_alert: Number(form.low_stock_alert)
        }]);
        if (error) throw error;
      }

      setForm({ product_id: "", product_name: "", low_stock_alert: "" });
      setEditingId(null);
      loadProducts(); 
    } catch (err) {
      console.error("Failed to save product:", err.message);
      alert("Error saving product. Is the ID already taken?");
    }
  };

  const handleEditClick = (e, product) => {
    e.stopPropagation(); 
    setForm({
      product_id: product.product_id,
      product_name: product.product_name,
      low_stock_alert: product.low_stock_alert,
    });
    setEditingId(product.id);
  };

  const cancelEdit = () => {
    setForm({ product_id: "", product_name: "", low_stock_alert: "" });
    setEditingId(null);
  };

  const handleDeleteProduct = async (e, productId) => {
    e.stopPropagation(); 
    if (!window.confirm("Are you sure you want to delete this product?")) return;

    try {
      const { error } = await supabase.from("products").delete().eq("product_id", productId);
      if (error) throw error;
      loadProducts();
    } catch (err) {
      console.error("Failed to delete product:", err.message);
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

      {/* ADD / EDIT FORM */}
      <div className="bg-white shadow rounded p-4 mb-6 flex gap-3 items-center flex-wrap">
        <input name="product_id" placeholder="Product ID" value={form.product_id} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[150px]" />
        <input name="product_name" placeholder="Product Name" value={form.product_name} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[150px]" />
        <input name="low_stock_alert" placeholder="Low Alert Qty" type="number" value={form.low_stock_alert} onChange={handleChange} className="border p-2 rounded w-32" />
        
        <button onClick={handleSaveProduct} className={`text-white px-6 py-2 rounded ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {editingId ? "Update" : "Add"}
        </button>
        
        {editingId && (
          <button onClick={cancelEdit} className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded">
            Cancel
          </button>
        )}

        {/* 🚀 BULK UPLOAD & EXPORT */}
        <div className="ml-auto flex gap-2 items-center">
          {/* Hidden File Input */}
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            style={{ display: "none" }} 
            ref={fileInputRef} 
            onChange={handleBulkUpload} 
          />
          
          <div className="flex flex-col items-end">
            <button 
              onClick={() => fileInputRef.current.click()} 
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition-colors"
            >
              Bulk Upload
            </button>
            <span className="text-xs text-gray-500 mt-1">Headers: Product_ID, Product_Name, Low_Alert, Opening_Stock, Location</span>
          </div>
          
          <button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors self-start">
            Export Excel
          </button>
        </div>
      </div>

      <input placeholder="Search by ID or Name..." value={search} onChange={(e) => setSearch(e.target.value)} className="border p-2 rounded w-full mb-4" />

      {/* TABLE */}
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
              <tr><td colSpan="7" className="p-4 text-gray-500 text-center">No products found</td></tr>
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
                  <td className="p-3 flex gap-2">
                    <button 
                      onClick={(e) => handleEditClick(e, p)} 
                      className="text-blue-600 hover:text-blue-800 font-semibold px-3 py-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                    >
                      Edit
                    </button>
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

      {/* LEDGER MODAL */}
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