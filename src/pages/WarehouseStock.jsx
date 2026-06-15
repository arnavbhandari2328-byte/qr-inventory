import { useEffect, useState } from "react";
import { supabase } from "../supabase";

// ── shared helpers ────────────────────────────────────────────────────────────
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
  if (n.includes("MS") || n.includes("MILD STEEL")) return "MS";
  if (n.includes("GI") || n.includes("GALVANISED") || n.includes("GALVANIZED")) return "GI";
  if (n.includes("CARBON STEEL") || n.includes("CS")) return "Carbon Steel";
  return "Other";
}

function inferCategory(name) {
  const n = name.toUpperCase();
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
  if (n.includes("SHEET") || n.includes("PLATE") || n.includes("NO.4") || n.includes("NO.2") || n.includes("NO.8") || n.includes("2B FINISH") || n.includes("BA FINISH") || n.includes("HAIRLINE")) return "Sheet / Plate";
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

function sortProductsBySize(products) {
  return [...products].sort((a, b) => {
    const sa = extractSizeKey(a.product_name);
    const sb = extractSizeKey(b.product_name);
    if (sa !== sb) return sa - sb;
    return a.product_id.localeCompare(b.product_id);
  });
}

function buildCatalog(products) {
  const catalog = {};
  products.forEach(p => {
    const mat = inferMaterial(p.product_name);
    const cat = inferCategory(p.product_name);
    if (!catalog[mat]) catalog[mat] = {};
    if (!catalog[mat][cat]) catalog[mat][cat] = [];
    catalog[mat][cat].push(p);
  });
  return catalog;
}

const CATEGORY_ORDER = [
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
// ── end shared helpers ────────────────────────────────────────────────────────

export default function WarehouseStock() {
  const [products, setProducts]         = useState([]);
  // stockSummary[productId][locationId] = net qty  (warehouse locations only)
  const [stockSummary, setStockSummary] = useState({});
  // Only non-Office locations shown in warehouse view
  const [locations, setLocations]       = useState([]);
  const [search, setSearch]             = useState("");
  const [openMaterials, setOpenMaterials]   = useState({});
  const [openCategories, setOpenCategories] = useState({});

  const [panelOpen, setPanelOpen]       = useState(false);
  const [panelProduct, setPanelProduct] = useState(null);
  const [form, setForm] = useState({
    location_id: "", type: "inward", qty: "", rate: "", party: "", date: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    // Step 1: fetch all non-office locations
    const { data: loc } = await supabase
      .from("locations")
      .select("*")
      .not("name", "ilike", "office");

    const warehouseLocations = loc || [];
    const warehouseLocIds = warehouseLocations.map(l => l.id);
    setLocations(warehouseLocations);

    if (warehouseLocIds.length === 0) {
      setProducts([]);
      setStockSummary({});
      return;
    }

    // Step 2: fetch transactions ONLY for warehouse/godown locations
    const { data: txns } = await supabase
      .from("transactions")
      .select("product_id, location_id, transaction_type, quantity")
      .in("location_id", warehouseLocIds);

    const txnsData = txns || [];

    // Step 3: build stock summary — keyed by product UUID, then by location UUID
    const summary = {};
    txnsData.forEach(t => {
      const pid = t.product_id;
      const lid = t.location_id;
      if (!pid || !lid) return;
      if (!summary[pid]) summary[pid] = {};
      if (summary[pid][lid] === undefined) summary[pid][lid] = 0;
      const qty = Number(t.quantity || 0);
      const type = (t.transaction_type || "").toLowerCase();
      summary[pid][lid] += type === "inward" ? qty : -qty;
    });

    // Step 4: only keep products that have at least 1 unit in warehouse
    // (total across all warehouse locations must be > 0)
    const productIdsWithWarehouseStock = Object.keys(summary).filter(pid =>
      Object.values(summary[pid]).reduce((s, v) => s + v, 0) > 0
    );

    if (productIdsWithWarehouseStock.length === 0) {
      setProducts([]);
      setStockSummary({});
      return;
    }

    const { data: prod } = await supabase
      .from("products")
      .select("*")
      .in("id", productIdsWithWarehouseStock);

    // Batch both state updates so React renders once with both
    setStockSummary(summary);
    setProducts(prod || []);
  }

  // Total warehouse stock for a product = sum across all warehouse location IDs
  const totalStock = (pid) =>
    Object.values(stockSummary[pid] || {}).reduce((s, v) => s + v, 0);

  // Stock for one specific warehouse location (by location UUID)
  const stockByLoc = (pid, locId) => stockSummary[pid]?.[locId] ?? 0;

  function openPanel(product) {
    setPanelProduct(product);
    const today = new Date().toISOString().split("T")[0];
    setForm({ location_id: locations[0]?.id || "", type: "inward", qty: "", rate: "", party: "", date: today });
    setPanelOpen(true);
  }

  async function handleAddStock() {
    if (!form.qty || !form.location_id) { alert("Fill in Location and Quantity."); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ts = form.date ? new Date(form.date + "T12:00:00+05:30").toISOString() : new Date().toISOString();
      const { error } = await supabase.from("transactions").insert([{
        product_id: panelProduct.id,
        location_id: form.location_id,
        transaction_type: form.type,
        quantity: Number(form.qty),
        rate: Number(form.rate || 0),
        party: form.party || "",
        created_by_email: user?.email || "",
        created_at: ts,
      }]);
      if (error) throw error;
      setPanelOpen(false);
      loadAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = search
    ? products.filter(p =>
        p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        p.product_id?.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  const catalog = buildCatalog(filtered);
  const materialKeys = Object.keys(catalog).sort();
  const toggleMaterial = (mat) => setOpenMaterials(prev => ({ ...prev, [mat]: !prev[mat] }));
  const toggleCategory = (key) => setOpenCategories(prev => ({ ...prev, [key]: !prev[key] }));

  const stockBadge = (product) => {
    const total = totalStock(product.id);
    const low = product.low_stock_alert;
    if (low && total <= low)
      return <span className="ml-2 text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">Low Stock</span>;
    return null;
  };

  const stockColor = (product) => {
    const total = totalStock(product.id);
    const low = product.low_stock_alert;
    if (low && total === 0) return "text-red-600";
    if (low && total <= low) return "text-orange-500";
    return "text-green-600";
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <span>🏭</span> Warehouse Stock
        </h1>
        <p className="text-gray-500 text-sm mt-1">Live stock across Warehouse &amp; Godown &mdash; click any product to log stock IN/OUT</p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-lg border-2 border-blue-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Catalog */}
      <div className="space-y-3">
        {materialKeys.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No products found</div>
        ) : materialKeys.map(mat => {
          const catKeys = sortCategoryKeys(Object.keys(catalog[mat]));
          const totalInMat = catKeys.reduce((s, c) => s + catalog[mat][c].length, 0);
          return (
            <div key={mat} className="bg-white rounded-xl shadow overflow-hidden">
              {/* Material header */}
              <button
                onClick={() => toggleMaterial(mat)}
                className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="font-bold text-gray-800 text-base">{mat}</span>
                <span className="text-xs text-gray-500">{totalInMat} products &middot; {catKeys.length} categories</span>
              </button>

              {openMaterials[mat] !== false && (
                <div className="divide-y divide-gray-100">
                  {catKeys.map(cat => {
                    const catKey = `${mat}__${cat}`;
                    const catProducts = sortProductsBySize(catalog[mat][cat]);
                    return (
                      <div key={cat}>
                        {/* Category sub-header */}
                        <button
                          onClick={() => toggleCategory(catKey)}
                          className="w-full flex items-center justify-between px-6 py-2 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <span className="text-sm font-semibold text-blue-700">{cat}</span>
                          <span className="text-xs text-blue-400">{catProducts.length} items</span>
                        </button>

                        {openCategories[catKey] !== false && (
                          <>
                            {/* Location columns header */}
                            <div className="grid px-6 py-1 bg-gray-50 border-b border-gray-200"
                              style={{ gridTemplateColumns: `1fr repeat(${locations.length + 1}, minmax(80px,120px))` }}
                            >
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</span>
                              {locations.map(l => (
                                <span key={l.id} className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">{l.name}</span>
                              ))}
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Total</span>
                            </div>

                            {/* Product rows */}
                            {catProducts.map((p, idx) => (
                              <button
                                key={p.id}
                                onClick={() => openPanel(p)}
                                className={`w-full grid px-6 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0 ${
                                  idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                                }`}
                                style={{ gridTemplateColumns: `1fr repeat(${locations.length + 1}, minmax(80px,120px))` }}
                              >
                                <span className="text-sm text-gray-700 font-medium pr-2">
                                  {p.product_name}
                                  {stockBadge(p)}
                                </span>
                                {locations.map(l => (
                                  <span key={l.id} className={`text-sm font-semibold text-center ${stockColor(p)}`}>
                                    {stockByLoc(p.id, l.id)} {p.unit || "Pcs"}
                                  </span>
                                ))}
                                <span className={`text-sm font-bold text-center ${stockColor(p)}`}>
                                  {totalStock(p.id)} {p.unit || "Pcs"}
                                </span>
                              </button>
                            ))}
                          </>
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

      {/* Side Panel */}
      {panelOpen && panelProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setPanelOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            <h2 className="text-lg font-bold text-gray-800 mb-1">{panelProduct.product_name}</h2>
            <p className="text-sm text-gray-500 mb-4">ID: {panelProduct.product_id}</p>

            {/* Stock per location summary */}
            <div className="mb-4 bg-gray-50 rounded-xl p-3 space-y-1">
              {locations.map(l => (
                <div key={l.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{l.name}</span>
                  <span className={`font-semibold ${stockColor(panelProduct)}`}>
                    {stockByLoc(panelProduct.id, l.id)} {panelProduct.unit || "Pcs"}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                <span className="font-semibold text-gray-700">Total</span>
                <span className={`font-bold ${stockColor(panelProduct)}`}>
                  {totalStock(panelProduct.id)} {panelProduct.unit || "Pcs"}
                </span>
              </div>
            </div>

            {/* Add stock form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Location</label>
                  <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))} className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option value="inward">Inward</option>
                    <option value="outward">Outward</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Quantity</label>
                  <input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="Qty" className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Rate (optional)</label>
                  <input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="₹" className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Party (optional)</label>
                  <input type="text" value={form.party} onChange={e => setForm(f => ({ ...f, party: e.target.value }))} placeholder="Party name" className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <button onClick={handleAddStock} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save Entry"}
              </button>
              <button onClick={() => setPanelOpen(false)} className="w-full border border-gray-300 text-gray-600 py-3 rounded-xl transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
