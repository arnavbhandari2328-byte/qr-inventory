import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

// Office location UUID — fetched once on mount
let OFFICE_LOCATION_ID = null;

// ── same catalog helpers as Products / WarehouseStock ─────────────────────────
function inferMaterial(name) {
  const n = name.toUpperCase();
  if (n.includes("316L")) return "SS 316L";
  if (n.includes("316"))  return "SS 316";
  if (n.includes("304L")) return "SS 304L";
  if (n.includes("304"))  return "SS 304";
  if (n.includes("202"))  return "SS 202";
  if (n.includes("201"))  return "SS 201";
  if (n.includes("310"))  return "SS 310";
  if (n.includes("321"))  return "SS 321";
  if (n.includes("409"))  return "SS 409";
  if (n.includes("430"))  return "SS 430";
  if (n.includes("CF8M")) return "SS 316";
  if (n.includes("CF8N")) return "SS 316";
  if (n.includes("CF8"))  return "SS 304";
  if (n.includes("MS") || n.includes("MILD STEEL")) return "MS";
  if (n.includes("GI") || n.includes("GALVANISED") || n.includes("GALVANIZED")) return "GI";
  if (n.includes("CARBON STEEL") || n.includes("CS")) return "Carbon Steel";
  return "Other";
}

function inferCategory(name) {
  const n = name.toUpperCase();
  if (n.includes("BALL VALVE") || n.includes("BV-S/E") || n.includes("BV-F/E")) return "Ball Valve";
  if (n.includes("SEAMLESS")) return "Seamless";
  if (n.includes("SCH 160") || n.includes("SCH-160") || n.includes("SCH160")) return "SCH 160";
  if (n.includes("SCH 80")  || n.includes("SCH-80")  || n.includes("SCH80"))  return "SCH 80";
  if (n.includes("SCH 40")  || n.includes("SCH-40")  || n.includes("SCH40"))  return "SCH 40";
  if (n.includes("SCH 20")  || n.includes("SCH-20")  || n.includes("SCH20"))  return "SCH 20";
  if (n.includes("SCH 10")  || n.includes("SCH-10")  || n.includes("SCH10"))  return "SCH 10";
  if (n.includes("SCH 5")   || n.includes("SCH-5")   || n.includes("SCH05") || n.includes("SCH-05")) return "SCH 5";
  const swg = n.match(/(\d+)\s*SWG/);
  if (swg) return `SWG ${swg[1]}`;
  if (n.includes("POLISH") || n.includes("POLISHED")) return "Polish Pipe";
  if (n.includes("SQUARE")) return "Square Rod";
  if (n.includes("RECTANGLE") || n.includes("RECTANGULAR") || n.includes("RECTANGE")) return "Rectangular Pipe";
  if (n.includes("ROUND BAR") || n.includes("ROUND ROD") || n.includes("BRIGHT ROD") || n.includes("BRIGHT BAR")) return "Round Bar";
  if (n.includes("FLAT BAR") || n.includes("FLAT ROD")) return "Flat Bar";
  if (n.includes("ANGLE")) return "Angle";
  if (n.includes("CHANNEL")) return "Channel";
  if (
    n.includes("SHEET") || n.includes("PLATE") ||
    n.includes(" MAT ") || n.includes(" MAT$") || n.endsWith(" MAT") ||
    n.includes("NO.4") || n.includes("NO.2") || n.includes("NO.8") ||
    n.includes("2B FINISH") || n.includes("BA FINISH") || n.includes("HAIRLINE")
  ) return "Sheet / Plate";
  if (n.includes("COIL") || n.includes("STRIP")) return "Coil / Strip";
  if (n.includes("ERW")) return "ERW";
  if (n.includes("PIPE")) return "Pipe (General)";
  return "General";
}

function parseInchFraction(raw) {
  if (raw.includes("/")) {
    const si = raw.indexOf("/");
    const den = parseInt(raw.slice(si + 1), 10);
    const num = parseInt(raw.slice(si - 1, si), 10);
    const whole = raw.slice(0, si - 1) ? parseInt(raw.slice(0, si - 1), 10) : 0;
    if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) return whole + num / den;
  }
  return parseFloat(raw) || 0;
}

function extractSizeKey(name) {
  const n = name.trim();
  const inch = n.match(/(\d+(?:\/\d+)?)\s*"/i);
  if (inch) return parseInchFraction(inch[1]);
  const nb = n.match(/(\d+(?:\.\d+)?)\s*NB/i);
  if (nb) return parseFloat(nb[1]);
  const mm = n.match(/(\d+(?:\.\d+)?)\s*(?:X\s|MM)/i);
  if (mm) return parseFloat(mm[1]);
  const any = n.match(/(\d+(?:\.\d+)?)/);
  if (any) return parseFloat(any[1]);
  return 0;
}

function sortItemsBySize(items) {
  return [...items].sort((a, b) => {
    const sa = extractSizeKey(a.product_name || a.name || "");
    const sb = extractSizeKey(b.product_name || b.name || "");
    if (sa !== sb) return sa - sb;
    return (a.product_name || a.name || "").localeCompare(b.product_name || b.name || "");
  });
}

function buildCatalog(items) {
  const catalog = {};
  items.forEach(item => {
    const itemName = item.product_name || item.name || "";
    const mat = inferMaterial(itemName);
    const cat = inferCategory(itemName);
    if (!catalog[mat]) catalog[mat] = {};
    if (!catalog[mat][cat]) catalog[mat][cat] = [];
    catalog[mat][cat].push(item);
  });
  return catalog;
}

const CATEGORY_ORDER = [
  "Ball Valve",
  "SCH 5","SCH 10","SCH 20","SCH 40","SCH 80","SCH 160","Seamless",
  "SWG 20","SWG 18","SWG 16","SWG 14","SWG 12","SWG 10",
  "ERW","Polish Pipe","Square Rod","Rectangular Pipe","Round Bar",
  "Flat Bar","Angle","Channel","Sheet / Plate","Coil / Strip","Pipe (General)","General",
];

function sortCategoryKeys(keys) {
  return [...keys].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}
// ── end helpers ───────────────────────────────────────────────────────────────

function calcOfficeStock(productId, transactions, officeLocationId) {
  return transactions
    .filter(t => t.product_id === productId && t.location_id === officeLocationId)
    .reduce((sum, t) => {
      const qty = Number(t.quantity || 0);
      const type = (t.transaction_type || "").toLowerCase();
      return sum + (type === "inward" ? qty : -qty);
    }, 0);
}

// ── CSV Bulk Upload parser ────────────────────────────────────────────────────
// Expected columns: product_id, product_name, unit, low_stock, high_stock
function parseBulkCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (col) => headers.indexOf(col);

  // Support both "product_name" and legacy "name"
  const nameIdx = idx("product_name") !== -1 ? idx("product_name") : idx("name");
  if (nameIdx === -1) throw new Error("CSV must have a 'product_name' column.");

  // product_id column — optional, will auto-generate if missing
  const pidIdx = idx("product_id");

  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const name = cols[nameIdx] || "";
    if (!name) throw new Error(`Row ${i + 2}: product_name is empty.`);
    const autoId = name.trim().toUpperCase().replace(/\s+/g, "-");
    return {
      product_id: pidIdx !== -1 && cols[pidIdx] ? cols[pidIdx].trim() : autoId,
      name,
      unit: idx("unit") !== -1 ? (cols[idx("unit")] || "Pcs") : "Pcs",
      low_stock_alert:  idx("low_stock")  !== -1 ? Number(cols[idx("low_stock")]  || 0) : 0,
      high_stock_alert: idx("high_stock") !== -1 ? Number(cols[idx("high_stock")] || 0) : 0,
    };
  });
}

export default function OfficeStock() {
  const [products, setProducts]         = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [officeLocationId, setOfficeLocationId] = useState(null);
  const [search, setSearch]             = useState("");
  const [openMaterials, setOpenMaterials]   = useState({});
  const [openCategories, setOpenCategories] = useState({});

  // new item form
  const [showAddItem, setShowAddItem]   = useState(false);
  const [newItem, setNewItem]           = useState({ name: "", unit: "Pcs", low_stock_alert: "", high_stock_alert: "", openingQty: "", openingRate: "" });
  const [addingItem, setAddingItem]     = useState(false);

  // bulk upload
  const [showBulk, setShowBulk]         = useState(false);
  const [bulkRows, setBulkRows]         = useState([]);
  const [bulkError, setBulkError]       = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult]     = useState(null);
  const fileInputRef                    = useRef(null);

  // stock panel
  const [panelOpen, setPanelOpen]       = useState(false);
  const [panelItem, setPanelItem]       = useState(null);
  const [form, setForm]                 = useState({ type: "inward", qty: "", rate: "", party: "", date: "" });
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("office-transactions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => { loadTransactions(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function getOfficeLocationId() {
    if (OFFICE_LOCATION_ID) return OFFICE_LOCATION_ID;
    const { data } = await supabase.from("locations").select("id").ilike("name", "office").single();
    OFFICE_LOCATION_ID = data?.id || null;
    return OFFICE_LOCATION_ID;
  }

  async function loadTransactions(locId) {
    const id = locId || officeLocationId || await getOfficeLocationId();
    if (!id) return;
    const { data: txns } = await supabase.from("transactions").select("*").eq("location_id", id).order("created_at");
    setTransactions(txns || []);
  }

  async function loadAll() {
    const locId = await getOfficeLocationId();
    setOfficeLocationId(locId);
    let txnsData = [];
    if (locId) {
      const { data: txns } = await supabase.from("transactions").select("*").eq("location_id", locId).order("created_at");
      txnsData = txns || [];
    }
    setTransactions(txnsData);

    // ── Fetch ALL ball valve products from DB (covers 0-qty items too) ──────
    const { data: ballValveProds } = await supabase
      .from("products")
      .select("*")
      .or("product_name.ilike.%ball valve%,product_id.ilike.%BV-%");

    const productMap = {};
    (ballValveProds || []).forEach(p => { productMap[p.id] = p; });

    // ── Also include any products that have office transactions ──────────────
    const txnProductIds = new Set(txnsData.map(t => t.product_id).filter(Boolean));
    const extraIds = [...txnProductIds].filter(id => !productMap[id]);
    if (extraIds.length > 0) {
      const { data: ep } = await supabase.from("products").select("*").in("id", extraIds);
      (ep || []).forEach(p => { productMap[p.id] = p; });
    }

    setProducts(Object.values(productMap));
  }

  async function handleAddItem() {
    if (!newItem.name.trim()) { alert("Enter an item name."); return; }
    const locId = officeLocationId || await getOfficeLocationId();
    if (!locId) { alert("Office location not found in the database."); return; }
    setAddingItem(true);
    try {
      const productId = newItem.name.trim().toUpperCase().replace(/\s+/g, "-");
      const { data: inserted, error } = await supabase.from("products").insert([{
        product_id: productId,
        product_name: newItem.name.trim(),
        unit: newItem.unit || "Pcs",
        low_stock_alert: Number(newItem.low_stock_alert || 0),
        high_stock_alert: Number(newItem.high_stock_alert || 0),
      }]).select("*").single();
      if (error) throw error;
      if (newItem.openingQty && Number(newItem.openingQty) > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: txErr } = await supabase.from("transactions").insert([{
          product_id: inserted.id,
          location_id: locId,
          transaction_type: "inward",
          quantity: Number(newItem.openingQty),
          rate: Number(newItem.openingRate || 0),
          party: "Opening Stock",
          created_by_email: user?.email || "",
          created_at: new Date().toISOString(),
        }]);
        if (txErr) throw txErr;
      }
      setNewItem({ name: "", unit: "Pcs", low_stock_alert: "", high_stock_alert: "", openingQty: "", openingRate: "" });
      setShowAddItem(false);
      loadAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setAddingItem(false);
    }
  }

  function handleFileChange(e) {
    setBulkError("");
    setBulkRows([]);
    setBulkResult(null);
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseBulkCSV(ev.target.result);
        setBulkRows(rows);
      } catch (err) {
        setBulkError(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleBulkUpload() {
    if (bulkRows.length === 0) return;
    setBulkUploading(true);
    setBulkResult(null);
    setBulkError("");
    let added = 0, skipped = 0, errors = [];
    for (const row of bulkRows) {
      try {
        const { data: existing } = await supabase.from("products").select("id").eq("product_id", row.product_id).maybeSingle();
        if (existing) {
          await supabase.from("products").update({
            low_stock_alert:  row.low_stock_alert  || 0,
            high_stock_alert: row.high_stock_alert || 0,
          }).eq("id", existing.id);
          skipped++;
        } else {
          const { error: insErr } = await supabase.from("products").insert([{
            product_id:       row.product_id,
            product_name:     row.name.trim(),
            unit:             row.unit || "Pcs",
            low_stock_alert:  row.low_stock_alert  || 0,
            high_stock_alert: row.high_stock_alert || 0,
          }]);
          if (insErr) throw insErr;
          added++;
        }
      } catch (err) {
        errors.push(`"${row.name}": ${err.message}`);
      }
    }
    setBulkUploading(false);
    setBulkResult({ added, skipped, errors });
    setBulkRows([]);
    await loadAll();
  }

  function downloadSampleCSV() {
    const csv = "product_id,product_name,unit,low_stock,high_stock\nNM-BV-S/E-IMP-CF8-1PC-1/2\",NM BV S/E IMP CF8 1PC 1/2\",Pcs,5,100\nNM-BV-S/E-IND-CF8N-2PC-3/4\",NM BV S/E IND CF8N 2PC 3/4\",Pcs,2,50";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bulk_upload_sample.csv";
    a.click();
  }

  async function handleDeleteProduct(e, product) {
    e.stopPropagation();
    const locId = officeLocationId || await getOfficeLocationId();
    if (!window.confirm(`Remove "${product.product_name}" from Office Stock view? (This removes its office transactions)`)) return;
    await supabase.from("transactions").delete().eq("product_id", product.id).eq("location_id", locId);
    loadAll();
  }

  function openPanel(item) {
    setPanelItem(item);
    const today = new Date().toISOString().split("T")[0];
    setForm({ type: "inward", qty: "", rate: "", party: "", date: today });
    setPanelOpen(true);
  }

  async function handleAddStock() {
    if (!form.qty) { alert("Enter a quantity."); return; }
    const locId = officeLocationId || await getOfficeLocationId();
    if (!locId) { alert("Office location not found."); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ts = form.date ? new Date(form.date + "T12:00:00+05:30").toISOString() : new Date().toISOString();
      const { error } = await supabase.from("transactions").insert([{
        product_id: panelItem.id,
        location_id: locId,
        transaction_type: form.type,
        quantity: Number(form.qty),
        rate: Number(form.rate || 0),
        party: form.party || "",
        created_by_email: user?.email || "",
        created_at: ts,
      }]);
      if (error) throw error;
      setPanelOpen(false);
      await loadAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredProducts = search
    ? products.filter(p => (p.product_name || "").toLowerCase().includes(search.toLowerCase()))
    : products;

  const catalog = buildCatalog(filteredProducts);
  const materialKeys = Object.keys(catalog).sort();
  const toggleMaterial = (mat) => setOpenMaterials(prev => ({ ...prev, [mat]: !prev[mat] }));
  const toggleCategory = (key) => setOpenCategories(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">🏢 Office Stock</h1>
          <p className="text-gray-500 text-sm mt-1">Ball valves & products with Office location transactions</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowBulk(true); setBulkRows([]); setBulkError(""); setBulkResult(null); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl shadow transition-colors"
          >
            📂 Bulk Upload
          </button>
          <button
            onClick={() => setShowAddItem(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl shadow transition-colors"
          >
            + Add New Item
          </button>
        </div>
      </div>

      {/* ── BULK UPLOAD MODAL ─────────────────────────────────────────────── */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">📂 Bulk Upload Items</h2>
              <button onClick={() => setShowBulk(false)} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">CSV Format (5 columns):</p>
              <code className="text-xs block bg-blue-100 rounded p-2">product_id, product_name, unit, low_stock, high_stock</code>
              <ul className="mt-2 space-y-1 text-xs list-disc pl-4">
                <li><strong>product_id</strong> – required. Exact product ID (e.g. NM-BV-S/E-IMP-CF8-1PC-1/2").</li>
                <li><strong>product_name</strong> – required. Human-readable name.</li>
                <li><strong>unit</strong> – optional (default: Pcs)</li>
                <li><strong>low_stock</strong> – optional. Alert below this qty.</li>
                <li><strong>high_stock</strong> – optional. Alert above this qty.</li>
              </ul>
              <button onClick={downloadSampleCSV} className="mt-2 text-blue-600 underline text-xs font-semibold">⬇ Download Sample CSV</button>
            </div>

            <label className="block mb-4">
              <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Select CSV File</span>
              <input
                ref={fileInputRef}
                type="file" accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
              />
            </label>

            {bulkError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm font-medium">⚠ {bulkError}</div>
            )}

            {bulkRows.length > 0 && !bulkResult && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Preview – {bulkRows.length} row{bulkRows.length !== 1 ? "s" : ""} found:</p>
                <div className="overflow-x-auto max-h-56 border border-gray-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 text-gray-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2 text-left">Product ID</th>
                        <th className="px-3 py-2 text-left">Product Name</th>
                        <th className="px-3 py-2 text-center">Unit</th>
                        <th className="px-3 py-2 text-center">Low Stock</th>
                        <th className="px-3 py-2 text-center">High Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                          <td className="px-3 py-1.5 font-mono text-gray-600 text-xs">{r.product_id}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-800">{r.name}</td>
                          <td className="px-3 py-1.5 text-center text-gray-500">{r.unit}</td>
                          <td className="px-3 py-1.5 text-center text-orange-600">{r.low_stock_alert || "–"}</td>
                          <td className="px-3 py-1.5 text-center text-blue-600">{r.high_stock_alert || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={handleBulkUpload}
                  disabled={bulkUploading}
                  className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
                >
                  {bulkUploading ? "Uploading..." : `✅ Upload ${bulkRows.length} Item${bulkRows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}

            {bulkResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
                <p className="font-bold text-green-700 mb-1">✅ Upload Complete</p>
                <p className="text-green-800">New items added: <strong>{bulkResult.added}</strong></p>
                <p className="text-green-800">Existing items (alerts updated): <strong>{bulkResult.skipped}</strong></p>
                {bulkResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-red-700 font-semibold">Errors ({bulkResult.errors.length}):</p>
                    <ul className="text-red-600 text-xs list-disc pl-4 mt-1 space-y-0.5">
                      {bulkResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
                <button onClick={() => setShowBulk(false)} className="mt-3 w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2.5 rounded-xl">Close</button>
              </div>
            )}

            {!bulkRows.length && !bulkResult && (
              <button onClick={() => setShowBulk(false)} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2.5 rounded-xl">Cancel</button>
            )}
          </div>
        </div>
      )}

      {/* ADD ITEM MODAL */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Add New Office Item</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Item Name</label>
                <input
                  value={newItem.name}
                  onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))}
                  placeholder="e.g. SS 316 BALL VALVE 1/2&quot;"
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {newItem.name && (
                  <p className="text-xs text-gray-400 mt-1">
                    Auto-category: <span className="font-semibold text-blue-600">{inferMaterial(newItem.name)} → {inferCategory(newItem.name)}</span>
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Unit</label>
                  <input
                    value={newItem.unit}
                    onChange={e => setNewItem(n => ({ ...n, unit: e.target.value }))}
                    placeholder="Pcs, Kg, Mtr..."
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">🔴 Low Alert Qty</label>
                  <input
                    type="number" min="0"
                    value={newItem.low_stock_alert}
                    onChange={e => setNewItem(n => ({ ...n, low_stock_alert: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">🔵 High Alert Qty</label>
                  <input
                    type="number" min="0"
                    value={newItem.high_stock_alert}
                    onChange={e => setNewItem(n => ({ ...n, high_stock_alert: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening Stock <span className="text-gray-400 normal-case font-normal">optional</span></p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Qty</label>
                    <input
                      type="number" min="0"
                      value={newItem.openingQty || ""}
                      onChange={e => setNewItem(n => ({ ...n, openingQty: e.target.value }))}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Rate (₹)</label>
                    <input
                      type="number" min="0"
                      value={newItem.openingRate || ""}
                      onChange={e => setNewItem(n => ({ ...n, openingRate: e.target.value }))}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddItem}
                disabled={addingItem}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
              >
                {addingItem ? "Adding..." : "✅ Add Item"}
              </button>
              <button
                onClick={() => setShowAddItem(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEARCH */}
      <div className="mb-5">
        <input
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 p-2.5 rounded-xl w-full max-w-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* CATALOG TREE */}
      <div className="space-y-3">
        {materialKeys.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400 text-lg font-medium">No office items yet</p>
            <p className="text-gray-400 text-sm mt-1">Add a transaction with location "Office" or click "+ Add New Item"</p>
          </div>
        ) : materialKeys.map(mat => {
          const isMaterialOpen = openMaterials[mat] !== false;
          const catKeys = sortCategoryKeys(Object.keys(catalog[mat]));
          const totalInMat = catKeys.reduce((s, c) => s + catalog[mat][c].length, 0);

          return (
            <div key={mat} className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
              <button
                onClick={() => toggleMaterial(mat)}
                className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-700 to-blue-800 text-white hover:from-blue-800 hover:to-blue-900 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{mat}</span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                    {totalInMat} items · {catKeys.length} categories
                  </span>
                </div>
                <span className="text-xl font-light">{isMaterialOpen ? "▲" : "▼"}</span>
              </button>

              {isMaterialOpen && (
                <div className="divide-y divide-gray-100">
                  {catKeys.map(cat => {
                    const catKey = mat + "||" + cat;
                    const isCatOpen = openCategories[catKey] !== false;
                    const catItems = sortItemsBySize(catalog[mat][cat]);

                    return (
                      <div key={cat}>
                        <button
                          onClick={() => toggleCategory(catKey)}
                          className="w-full flex items-center justify-between px-6 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-blue-800">{cat}</span>
                            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
                          </div>
                          <span className="text-blue-400 text-sm">{isCatOpen ? "▲" : "▼"}</span>
                        </button>

                        {isCatOpen && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <tr>
                                  <th className="px-6 py-2 text-left font-semibold">Item Name</th>
                                  <th className="px-4 py-2 text-center font-semibold">Qty</th>
                                  <th className="px-4 py-2 text-center font-semibold">Unit</th>
                                  <th className="px-4 py-2 text-center font-semibold">Low Alert</th>
                                  <th className="px-4 py-2 text-center font-semibold">High Alert</th>
                                  <th className="px-4 py-2 text-center font-semibold">Status</th>
                                  <th className="px-4 py-2 text-center font-semibold">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catItems.map((item, idx) => {
                                  const qty = calcOfficeStock(item.id, transactions, officeLocationId);
                                  const low = item.low_stock_alert && qty <= Number(item.low_stock_alert);
                                  const high = item.high_stock_alert && qty >= Number(item.high_stock_alert);
                                  return (
                                    <tr
                                      key={item.id}
                                      className={`border-t border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"} hover:bg-blue-50/30 transition-colors`}
                                    >
                                      <td className="px-6 py-3">
                                        <div className="font-medium text-gray-800">{item.product_name || item.name}</div>
                                      </td>
                                      <td className={`px-4 py-3 text-center font-bold tabular-nums text-lg ${
                                        qty === 0 ? "text-red-500" : low ? "text-orange-500" : high ? "text-blue-600" : "text-green-600"
                                      }`}>{qty}</td>
                                      <td className="px-4 py-3 text-center text-gray-500">{item.unit || "Pcs"}</td>
                                      <td className="px-4 py-3 text-center">
                                        {item.low_stock_alert ? (
                                          <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">≤{item.low_stock_alert}</span>
                                        ) : <span className="text-gray-300 text-xs">–</span>}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {item.high_stock_alert ? (
                                          <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">≥{item.high_stock_alert}</span>
                                        ) : <span className="text-gray-300 text-xs">–</span>}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {qty === 0 ? (
                                          <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">Out of Stock</span>
                                        ) : high ? (
                                          <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">🔵 Overstocked</span>
                                        ) : low ? (
                                          <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">⚠ Low</span>
                                        ) : (
                                          <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">✅ In Stock</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-center">
                                          <button
                                            onClick={() => openPanel(item)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                          >
                                            + Stock
                                          </button>
                                          <button
                                            onClick={(e) => handleDeleteProduct(e, item)}
                                            className="bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-2 py-1.5 rounded-lg transition-colors"
                                          >
                                            Del
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* STOCK PANEL */}
      {panelOpen && panelItem && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{panelItem.product_name}</h2>
                <p className="text-sm text-gray-500">
                  Current Office Qty: <span className="font-bold text-blue-600">{calcOfficeStock(panelItem.id, transactions, officeLocationId)} {panelItem.unit || "Pcs"}</span>
                </p>
              </div>
              <button onClick={() => setPanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl font-bold">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Transaction Type</label>
                <div className="flex gap-2">
                  {["inward","outward"].map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2 rounded-xl font-bold text-sm border-2 transition-colors ${
                        form.type === t
                          ? t === "inward" ? "bg-green-500 border-green-500 text-white" : "bg-red-500 border-red-500 text-white"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {t === "inward" ? "⬆ Inward" : "⬇ Outward"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Qty *</label>
                  <input
                    type="number" min="0"
                    value={form.qty}
                    onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rate (₹)</label>
                  <input
                    type="number" min="0"
                    value={form.rate}
                    onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Party / Vendor</label>
                <input
                  value={form.party}
                  onChange={e => setForm(f => ({ ...f, party: e.target.value }))}
                  placeholder="Optional"
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAddStock}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
              >
                {saving ? "Saving..." : "✅ Save"}
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
