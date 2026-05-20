import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STORAGE_KEY = "productDisplayOrder";

const ADMIN_EMAILS = [
  "niveemetals@gmail.com",
  "vishalom999@gmail.com",
  "vikrambhandari7171@gmail.com",
];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [orderedIds, setOrderedIds] = useState([]);
  const [stockSummary, setStockSummary] = useState({}); // { productId: { Office: n, Godown: n, Warehouse: n } }
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [latestTally, setLatestTally] = useState(null);
  const [tallyLoading, setTallyLoading] = useState(false);

  const [form, setForm] = useState({
    product_id: "",
    product_name: "",
    low_stock_alert: "",
    high_stock_alert: "",
    adj_location_id: "",
    adj_quantity: "",
    adj_type: "inward",
    adj_party: "",
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    checkUserRole();
    loadProducts();
    loadLatestTally();

    const channel = supabase
      .channel("transactions-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          loadStockSummary();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadProducts();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (ADMIN_EMAILS.includes(user?.email)) setIsAdmin(true);
  };

  const loadLatestTally = async () => {
    try {
      const { data, error } = await supabase
        .from("tally_logs")
        .select("*")
        .order("tallied_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setLatestTally(data || null);
    } catch (err) {
      console.error("Failed to load tally log:", err.message);
    }
  };

  const handleTallyNow = async () => {
    if (!window.confirm("Mark all products as tallied right now?")) return;
    setTallyLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || "unknown";
      const { error } = await supabase.from("tally_logs").insert([{
        tallied_at: new Date().toISOString(),
        tallied_by: email
      }]);
      if (error) throw error;
      await loadLatestTally();
      alert("\u2705 Tally recorded successfully!");
    } catch (err) {
      console.error("Tally error:", err.message);
      alert("Error recording tally: " + err.message);
    } finally {
      setTallyLoading(false);
    }
  };

  // ✅ FIX: Handle both 'current_stock' and 'total_stock' column names from the view
  const loadStockSummary = async () => {
    try {
      const { data, error } = await supabase.from("stock_summary").select("*");
      if (error) throw error;

      const summary = {};
      (data || []).forEach(row => {
        if (!summary[row.product_id]) summary[row.product_id] = {};
        // Support both column name variants from the DB view
        const qty = row.current_stock ?? row.total_stock ?? 0;
        summary[row.product_id][row.location_name] = qty;
      });
      setStockSummary(summary);
    } catch (err) {
      console.error("Failed to load stock summary:", err.message);
    }
  };

  // Returns product IDs sorted alphabetically by product_id string — the canonical default order
  const getDefaultOrder = (prod) =>
    [...prod]
      .sort((a, b) => a.product_id.localeCompare(b.product_id))
      .map(p => p.id);

  const loadProducts = async () => {
    try {
      const { data: prod, error: prodErr } = await supabase.from("products").select("*");
      const { data: loc, error: locErr } = await supabase.from("locations").select("*");

      if (prodErr) throw prodErr;
      if (locErr) throw locErr;

      setProducts(prod || []);
      setLocations(loc || []);

      const savedOrder = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (savedOrder.length > 0) {
        const savedIds = savedOrder.filter(id => (prod || []).some(p => p.id === id));
        const newIds = getDefaultOrder(prod || []).filter(id => !savedIds.includes(id));
        setOrderedIds([...savedIds, ...newIds]);
      } else {
        // No saved order — use alphabetical default
        setOrderedIds(getDefaultOrder(prod || []));
      }

      await loadStockSummary();
    } catch (err) {
      console.error("Failed loading data from Supabase:", err.message);
    }
  };

  const stockByLocation = (productId, locationName) => {
    return stockSummary[productId]?.[locationName] ?? 0;
  };

  const saveOrder = (ids) => localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));

  // ✅ FIX: Reset to alphabetical order by product_id, not random DB insertion order
  const resetOrder = () => {
    const defaultIds = getDefaultOrder(products);
    setOrderedIds(defaultIds);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleDragStart = (e, index) => {
    dragIndexRef.current = index;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };
  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null); setIsDragging(false); return;
    }
    const newIds = [...orderedIds];
    const [moved] = newIds.splice(fromIndex, 1);
    newIds.splice(dropIndex, 0, moved);
    setOrderedIds(newIds);
    saveOrder(newIds);
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setIsDragging(false);
  };
  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setIsDragging(false);
  };
  const touchStartY = useRef(null);
  const touchFromIndex = useRef(null);
  const handleTouchStart = (e, index) => {
    touchStartY.current = e.touches[0].clientY;
    touchFromIndex.current = index;
  };
  const handleTouchEnd = (e) => {
    if (touchFromIndex.current === null) return;
    const endY = e.changedTouches[0].clientY;
    const rows = document.querySelectorAll("tr[data-drag-index]");
    let dropIdx = touchFromIndex.current;
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (endY > rect.top + rect.height / 2) dropIdx = Number(row.getAttribute("data-drag-index"));
    });
    if (dropIdx !== touchFromIndex.current) {
      const newIds = [...orderedIds];
      const [moved] = newIds.splice(touchFromIndex.current, 1);
      newIds.splice(dropIdx, 0, moved);
      setOrderedIds(newIds);
      saveOrder(newIds);
    }
    touchFromIndex.current = null;
  };

  const formatTimeDisplay = (dbDateString) => {
    if (!dbDateString) return "-";
    return dbDateString.replace('T', ' ').split('.')[0];
  };

  const formatTallyDisplay = (dbDateString) => {
    if (!dbDateString) return null;
    return new Date(dbDateString).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    });
  };

  const openLedger = async (product) => {
    setSelectedProduct(product);
    setLedger([]);
    setLedgerLoading(true);
    try {
      const { data: productTrans, error } = await supabase
        .from("transactions")
        .select("*, locations(name)")
        .eq("product_id", product.id)
        .order("created_at", { ascending: true });
      if (error) throw error;

      let balance = 0;
      const calculated = (productTrans || []).map(t => {
        if (t.transaction_type === "inward") balance += Number(t.quantity);
        else balance -= Number(t.quantity);
        return {
          ...t,
          location_name: t.locations?.name || "",
          balance
        };
      });
      setLedger(calculated);

      await loadStockSummary();
    } catch (err) {
      console.error("Failed to load ledger:", err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!products.length) return;
    const data = products.map(p => ({
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

  const handleExportPDF = () => {
    try {
      if (!products.length) return;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(13);
      doc.setTextColor(10, 42, 94);
      doc.text("Products Report \u2014 Nivee Metals", 14, 13);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Generated: " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), 14, 19);

      const head = [["Product ID", "Product Name", "Office", "Godown", "Warehouse", "Low Alert", "High Alert"]];
      const body = products.map(p => [
        p.product_id,
        p.product_name,
        String(stockByLocation(p.id, "Office")),
        String(stockByLocation(p.id, "Godown")),
        String(stockByLocation(p.id, "Warehouse")),
        String(p.low_stock_alert),
        String(p.high_stock_alert || 0)
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 23,
        theme: "grid",
        styles: {
          fontSize: 7,
          cellPadding: 2,
          overflow: "ellipsize",
          halign: "left",
          lineColor: [220, 220, 220],
          lineWidth: 0.2
        },
        headStyles: {
          fillColor: [10, 42, 94],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 7
        },
        alternateRowStyles: { fillColor: [248, 249, 252] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 80 },
          2: { cellWidth: 22, halign: "center" },
          3: { cellWidth: 22, halign: "center" },
          4: { cellWidth: 26, halign: "center" },
          5: { cellWidth: 22, halign: "center" },
          6: { cellWidth: 22, halign: "center" }
        },
        margin: { top: 23, left: 14, right: 14 }
      });

      doc.save("Products_Report.pdf");
    } catch (err) {
      console.error("PDF export error:", err);
      alert("PDF export failed: " + err.message);
    }
  };

  const handleBulkUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const localEmail = localStorage.getItem("userEmail");
        const { data: { user } } = await supabase.auth.getUser();
        const activeEmployee = user?.email || localEmail || "System Admin";
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (data.length === 0) throw new Error("Spreadsheet is empty.");
        const headers = Object.keys(data[0]);
        const normalize = (str) => String(str).toLowerCase().replace(/[\s_]/g, '');
        const locationMap = [];
        locations.forEach(loc => {
          const match = headers.find(k => normalize(k) === normalize(loc.name));
          if (match) locationMap.push({ id: loc.id, name: loc.name, headerKey: match });
        });
        if (locationMap.length === 0)
          throw new Error("Couldn't find location columns. Add: " + locations.map(l => l.name).join(", "));
        const idKey = headers.find(k => normalize(k).includes('productid') || normalize(k) === 'id');
        const nameKey = headers.find(k => normalize(k).includes('productname') || normalize(k) === 'name');
        const lowAlertKey = headers.find(k => normalize(k).includes('low'));
        const highAlertKey = headers.find(k => normalize(k).includes('high') || normalize(k).includes('max'));
        if (!highAlertKey) {
          const proceed = window.confirm("\u26a0\ufe0f Couldn't find High Alert column.\nHeaders: [ " + headers.join(", ") + " ]\nContinue with High Alert = 0?");
          if (!proceed) { e.target.value = null; return; }
        }
        const productsToUpsert = [];
        const validRows = [];
        data.forEach(row => {
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
          alert("No valid data. Ensure headers include 'Product ID' and 'Product Name'."); return;
        }
        const { data: upsertedProducts, error: prodErr } = await supabase
          .from("products").upsert(productsToUpsert, { onConflict: "product_id" }).select("*");
        if (prodErr) throw prodErr;
        const transactionsToInsert = [];
        validRows.forEach(row => {
          const dbProduct = upsertedProducts.find(p => p.product_id === String(row[idKey]));
          if (dbProduct) {
            locationMap.forEach(loc => {
              const stock = Number(row[loc.headerKey] || 0);
              if (stock > 0) transactionsToInsert.push({
                product_id: dbProduct.id, location_id: loc.id,
                transaction_type: "inward", quantity: stock,
                party: "Bulk Opening Stock", created_by_email: activeEmployee
              });
            });
          }
        });
        if (transactionsToInsert.length > 0) {
          const { error: transErr } = await supabase.from("transactions").insert(transactionsToInsert);
          if (transErr) throw transErr;
        }
        alert("Success! Updated " + upsertedProducts.length + " products and logged " + transactionsToInsert.length + " stock allocations.");
        loadProducts();
      } catch (err) {
        console.error("Bulk upload error:", err.message);
        alert("Upload Failed: " + err.message);
      } finally { e.target.value = null; }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveProduct = async () => {
    if (!form.product_id || !form.product_name) {
      alert("Please fill in the Product ID and Name."); return;
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
        if (form.adj_location_id && form.adj_quantity && Number(form.adj_quantity) > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          const { error: transErr } = await supabase.from("transactions").insert([{
            product_id: editingId,
            location_id: form.adj_location_id,
            transaction_type: form.adj_type,
            quantity: Number(form.adj_quantity),
            party: form.adj_party || "Manual Adjustment",
            created_by_email: user?.email || "admin"
          }]);
          if (transErr) throw transErr;
        }
      } else {
        const { error } = await supabase.from("products").insert([payload]);
        if (error) throw error;
      }
      setForm({ product_id: "", product_name: "", low_stock_alert: "", high_stock_alert: "", adj_location_id: "", adj_quantity: "", adj_type: "inward", adj_party: "" });
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
      adj_location_id: "",
      adj_quantity: "",
      adj_type: "inward",
      adj_party: "",
    });
    setEditingId(product.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setForm({ product_id: "", product_name: "", low_stock_alert: "", high_stock_alert: "", adj_location_id: "", adj_quantity: "", adj_type: "inward", adj_party: "" });
    setEditingId(null);
  };

  const handleDeleteProduct = async (e, productId) => {
    e.stopPropagation();
    if (!isAdmin) { alert("Unauthorized: Only admins can delete products."); return; }
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      const { error } = await supabase.from("products").delete().eq("product_id", productId);
      if (error) throw error;
      loadProducts();
    } catch (err) {
      console.error("Failed to delete product:", err.message);
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const orderedProducts = orderedIds.map(id => products.find(p => p.id === id)).filter(Boolean);
  const filtered = orderedProducts.filter(
    p => p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
         p.product_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Products</h1>
        <button
          onClick={handleTallyNow}
          disabled={tallyLoading}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl shadow transition-all text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          {tallyLoading ? "Saving..." : "\ud83d\udccb Tally Now"}
        </button>
      </div>

      {/* Last tally info bar */}
      {latestTally && (
        <div className="mb-4 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 flex items-center gap-2">
          <span>\u2705</span>
          <span>Last tallied on <strong>{formatTallyDisplay(latestTally.tallied_at)}</strong> by {latestTally.tallied_by}</span>
        </div>
      )}

      {/* ADD / EDIT FORM */}
      <div className="bg-white shadow rounded p-4 mb-6">
        <div className="flex gap-3 items-center flex-wrap">
          <input name="product_id" placeholder="Product ID" value={form.product_id} onChange={handleChange} disabled={!!editingId} className="border p-2 rounded flex-1 min-w-[150px] disabled:bg-gray-100" />
          <input name="product_name" placeholder="Product Name" value={form.product_name} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[150px]" />
          <input name="low_stock_alert" placeholder="Low Alert Qty" type="number" value={form.low_stock_alert} onChange={handleChange} className="border p-2 rounded w-32" />
          <input name="high_stock_alert" placeholder="High Alert Qty" type="number" value={form.high_stock_alert} onChange={handleChange} className="border p-2 rounded w-32" />

          {!editingId && (
            <button onClick={handleSaveProduct} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded">Add</button>
          )}

          {!editingId && (
            <div className="ml-auto flex gap-2 items-center">
              <input type="file" accept=".xlsx, .xls, .csv" style={{ display: "none" }} ref={fileInputRef} onChange={handleBulkUpload} />
              <div className="flex flex-col items-end">
                <button onClick={() => fileInputRef.current.click()} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition-colors">
                  Bulk Upload
                </button>
                <span className="text-xs text-gray-500 mt-1">Headers: Product ID, Product Name, Low Alert, High Alert, Office, Godown, Warehouse</span>
              </div>
              <button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors self-start">
                Export Excel
              </button>
              <button onClick={handleExportPDF} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors self-start">
                Export PDF
              </button>
            </div>
          )}
        </div>

        {editingId && (
          <div className="mt-4 pt-4 border-t border-dashed border-orange-300">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-3">\ud83d\udce6 Stock Adjustment (optional)</p>
            <div className="flex gap-3 items-center flex-wrap">
              <select name="adj_location_id" value={form.adj_location_id} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[140px] bg-white">
                <option value="">\u2014 Select Location \u2014</option>
                {locations.map(loc => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
              </select>
              <div className="flex rounded overflow-hidden border">
                <button type="button" onClick={() => setForm(f => ({ ...f, adj_type: "inward" }))} className={`px-4 py-2 text-sm font-semibold transition-colors ${form.adj_type === "inward" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>\u25b2 Inward</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, adj_type: "outward" }))} className={`px-4 py-2 text-sm font-semibold transition-colors ${form.adj_type === "outward" ? "bg-red-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>\u25bc Outward</button>
              </div>
              <input name="adj_quantity" placeholder="Quantity" type="number" min="0" value={form.adj_quantity} onChange={handleChange} className="border p-2 rounded w-32" />
              <input name="adj_party" placeholder="Party / Remark (optional)" value={form.adj_party} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[180px]" />
              <button onClick={handleSaveProduct} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded font-semibold">Update</button>
              <button onClick={cancelEdit} className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded">Cancel</button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Leave Location &amp; Quantity blank to update product details only without logging a transaction.</p>
          </div>
        )}
      </div>

      {/* SEARCH + RESET ORDER */}
      <div className="flex gap-3 items-center mb-4">
        <input placeholder="Search by ID or Name..." value={search} onChange={(e) => setSearch(e.target.value)} className="border p-2 rounded flex-1" />
        <button onClick={resetOrder} title="Restore alphabetical product order" className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded transition-colors whitespace-nowrap">
          \u21ba Reset Order
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr className="text-left text-gray-700">
              <th className="p-3 w-10 text-gray-400 text-xs uppercase">Order</th>
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
              <tr><td colSpan="9" className="p-4 text-gray-500 text-center">No products found</td></tr>
            ) : (
              filtered.map((p, index) => {
                const isDraggedRow = isDragging && dragIndexRef.current === index;
                const isDropTarget = dragOverIndex === index && dragIndexRef.current !== index;
                return (
                  <tr
                    key={p.id}
                    data-drag-index={index}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, index)}
                    onTouchEnd={(e) => handleTouchEnd(e, index)}
                    onClick={() => openLedger(p)}
                    className={`border-b cursor-pointer transition-all
                      ${editingId === p.id ? "bg-orange-50 border-l-4 border-l-orange-400" : ""}
                      ${isDraggedRow ? "opacity-40 bg-blue-50" : ""}
                      ${isDropTarget ? "border-t-2 border-t-blue-500 bg-blue-50" : (editingId === p.id ? "" : "hover:bg-blue-50")}
                    `}
                  >
                    <td className="p-3 text-gray-400 cursor-grab active:cursor-grabbing select-none" onClick={(e) => e.stopPropagation()} title="Drag to reorder">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mx-auto hover:text-gray-600 transition-colors">
                        <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                      </svg>
                    </td>
                    <td className="p-3 font-medium">{p.product_id}</td>
                    <td className="p-3">{p.product_name}</td>
                    <td className="p-3 font-semibold text-blue-600">{stockByLocation(p.id, "Office")}</td>
                    <td className="p-3 font-semibold text-purple-600">{stockByLocation(p.id, "Godown")}</td>
                    <td className="p-3 font-semibold text-green-600">{stockByLocation(p.id, "Warehouse")}</td>
                    <td className="p-3"><span className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-sm font-semibold">{p.low_stock_alert}</span></td>
                    <td className="p-3"><span className="px-3 py-1 rounded-full bg-orange-100 text-orange-600 text-sm font-semibold">{p.high_stock_alert || 0}</span></td>
                    <td className="p-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => handleEditClick(e, p)} className="text-blue-600 hover:text-blue-800 font-semibold px-3 py-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors">Edit</button>
                      {isAdmin && (
                        <button onClick={(e) => handleDeleteProduct(e, p.product_id)} className="text-red-500 hover:text-red-700 font-semibold px-3 py-1 bg-red-50 rounded hover:bg-red-100 transition-colors">Delete</button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* LEDGER MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-800">\ud83d\udcd2 Ledger \u2014 {selectedProduct.product_name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">ID: {selectedProduct.product_id}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none">\u00d7</button>
            </div>

            {/* Modal Body */}
            <div className="overflow-auto flex-1 p-4">
              {ledgerLoading ? (
                <div className="text-center py-12 text-gray-400">Loading transactions...</div>
              ) : ledger.length === 0 ? (
                <div className="text-center py-12 text-gray-400">No transactions found for this product.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-600 border-b">
                      <th className="p-3">Date / Time</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Balance</th>
                      <th className="p-3">Party</th>
                      <th className="p-3">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((t, i) => (
                      <tr key={t.id || i} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-gray-500 whitespace-nowrap">{formatTimeDisplay(t.created_at)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.transaction_type === "inward" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {t.transaction_type === "inward" ? "\u25b2 In" : "\u25bc Out"}
                          </span>
                        </td>
                        <td className="p-3 text-gray-700">{t.location_name}</td>
                        <td className={`p-3 font-semibold ${t.transaction_type === "inward" ? "text-green-600" : "text-red-500"}`}>
                          {t.transaction_type === "inward" ? "+" : "-"}{t.quantity}
                        </td>
                        <td className="p-3 font-bold text-gray-800">{t.balance}</td>
                        <td className="p-3 text-gray-600">{t.party || "\u2014"}</td>
                        <td className="p-3 text-gray-400 text-xs">{t.created_by_email || "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* \u2705 Modal Footer \u2014 Latest Tally Date */}
            <div className="border-t px-5 py-3 bg-gray-50 rounded-b-xl flex items-center justify-between flex-wrap gap-2">
              {latestTally ? (
                <span className="text-sm text-indigo-700 flex items-center gap-1.5">
                  <span>\u2705</span>
                  <span>Last tallied on <strong>{formatTallyDisplay(latestTally.tallied_at)}</strong> by {latestTally.tallied_by}</span>
                </span>
              ) : (
                <span className="text-sm text-gray-400">No tally recorded yet.</span>
              )}
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-1.5 bg-white border rounded-lg hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
