import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [locations, setLocations] = useState([]); 
  const [search, setSearch] = useState("");
  
  const [isAdmin, setIsAdmin] = useState(false);

  const [form, setForm] = useState({
    product_id: "",
    product_name: "",
    low_stock_alert: "",
    high_stock_alert: "",
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    checkUserRole(); 
    loadProducts();
  }, []);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email === "niveemetals@gmail.com") {
      setIsAdmin(true);
    }
  };

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

  const formatIST = (utcString) => {
    if (!utcString) return "Unknown Date";
    const date = new Date(utcString.endsWith("Z") ? utcString : utcString + "Z");
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

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

  const handleExportExcel = () => {
    if (!products.length) return;

    const data = products.map((p) => ({
      Product_ID: p.product_id,
      Product_Name: p.product_name,
      Office: stockByLocation(p.id, "Office"),
      Godown: stockByLocation(p.id, "Godown"),
      Warehouse: stockByLocation(p.id, "Warehouse"),
      Low_Alert: p.low_stock_alert,
      High_Alert: p.high_stock_alert,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Products_Report.xlsx");
  };

  const handleBulkUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const employeeEmail = user?.email || "System Admin";

        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (data.length === 0) throw new Error("Spreadsheet is empty.");

        // ✅ Grab the headers from the very first row
        const headers = Object.keys(data[0]);
        const normalize = (str) => String(str).toLowerCase().replace(/[\s_]/g, '');

        const locationMap = [];
        locations.forEach(loc => {
          const match = headers.find(k => normalize(k) === normalize(loc.name));
          if (match) {
            locationMap.push({ id: loc.id, name: loc.name, headerKey: match });
          }
        });

        if (locationMap.length === 0) {
          throw new Error(`We couldn't find any location columns. Add columns named: ${locations.map(l => l.name).join(", ")}`);
        }

        const idKey = headers.find(k => normalize(k).includes('productid') || normalize(k) === 'id');
        const nameKey = headers.find(k => normalize(k).includes('productname') || normalize(k) === 'name');
        const lowAlertKey = headers.find(k => normalize(k).includes('low'));
        const highAlertKey = headers.find(k => normalize(k).includes('high') || normalize(k).includes('max'));

        // 🚨 HEADER DETECTIVE: This will popup if the app can't find your High Alert column
        if (!highAlertKey) {
          const proceed = window.confirm(
            `⚠️ WARNING: We couldn't find your "High Alert" column!\n\n` +
            `The headers we successfully read from your file are:\n[ ${headers.join(", ")} ]\n\n` +
            `Do you want to continue anyway and let High Alert default to 0?`
          );
          if (!proceed) {
             e.target.value = null;
             return; // Stops the upload so you can fix Excel
          }
        }

        const productsToUpsert = [];
        const validRows = []; 

        data.forEach((row) => {
          if (idKey && row[idKey] && nameKey && row[nameKey]) {
            productsToUpsert.push({
              product_id: String(row[idKey]),
              product_name: String(row[nameKey]),
              low_stock_alert: Number(row[lowAlertKey] || 0),
              high_stock_alert: Number(row[highAlertKey] || 0) 
            });
            validRows.push(row);
          }
        });

        if (productsToUpsert.length === 0) {
          alert("No valid data found. Ensure headers include 'Product ID' and 'Product Name'.");
          return;
        }

        const { data: upsertedProducts, error: prodErr } = await supabase
          .from("products")
          .upsert(productsToUpsert, { onConflict: "product_id" }) 
          .select("*"); 

        if (prodErr) throw prodErr;

        const transactionsToInsert = [];

        validRows.forEach((row) => {
          const pIdStr = String(row[idKey]);
          const dbProduct = upsertedProducts.find(p => p.product_id === pIdStr);

          if (dbProduct) {
            locationMap.forEach(loc => {
              const stock = Number(row[loc.headerKey] || 0);
              if (stock > 0) {
                transactionsToInsert.push({
                  product_id: dbProduct.id, 
                  location_id: loc.id, 
                  transaction_type: "inward",
                  quantity: stock,
                  party: "Bulk Opening Stock",
                  created_by_email: employeeEmail
                });
              }
            });
          }
        });

        if (transactionsToInsert.length > 0) {
          const { error: transErr } = await supabase
            .from("transactions")
            .insert(transactionsToInsert);
          
          if (transErr) throw transErr;
        }

        alert(`Success! Updated ${upsertedProducts.length} products and logged ${transactionsToInsert.length} stock allocations.`);
        loadProducts(); 
      } catch (err) {
        console.error("Bulk upload error:", err.message);
        alert(`Upload Failed: ${err.message}`);
      } finally {
        e.target.value = null; 
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveProduct = async () => {
    if (!form.product_id || !form.product_name) {
      alert("Please fill in the Product ID and Name.");
      return;
    }

    try {
      const payload = {
        product_id: form.product_id,
        product_name: form.product_name,
        low_stock_alert: Number(form.low_stock_alert || 0),
        high_stock_alert: Number(form.high_stock_alert || 0)
      };

      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert([payload]);
        if (error) throw error;
      }

      setForm({ product_id: "", product_name: "", low_stock_alert: "", high_stock_alert: "" });
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
      high_stock_alert: product.high_stock_alert || "",
    });
    setEditingId(product.id);
  };

  const cancelEdit = () => {
    setForm({ product_id: "", product_name: "", low_stock_alert: "", high_stock_alert: "" });
    setEditingId(null);
  };

  const handleDeleteProduct = async (e, productId) => {
    e.stopPropagation(); 
    
    if (!isAdmin) {
      alert("Unauthorized: Only the Master Admin can delete products.");
      return;
    }

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
        <input name="high_stock_alert" placeholder="High Alert Qty" type="number" value={form.high_stock_alert} onChange={handleChange} className="border p-2 rounded w-32" />
        
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
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv" 
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
            <span className="text-xs text-gray-500 mt-1">Headers: Product ID, Product Name, Low Alert, High Alert, Office, Godown, Warehouse</span>
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
              <th className="p-3">High Alert</th> 
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="8" className="p-4 text-gray-500 text-center">No products found</td></tr>
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
                    <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-600 text-sm font-semibold">
                      {p.high_stock_alert || 0}
                    </span>
                  </td>
                  <td className="p-3 flex gap-2">
                    <button 
                      onClick={(e) => handleEditClick(e, p)} 
                      className="text-blue-600 hover:text-blue-800 font-semibold px-3 py-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                    >
                      Edit
                    </button>
                    
                    {isAdmin && (
                      <button 
                        onClick={(e) => handleDeleteProduct(e, p.product_id)} 
                        className="text-red-500 hover:text-red-700 font-semibold px-3 py-1 bg-red-50 rounded hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    )}
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
                    <td className="border p-2">{formatIST(l.created_at)}</td>
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