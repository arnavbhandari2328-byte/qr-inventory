import { useEffect, useState } from "react";
import { supabase } from "../supabase";

// ── shared helpers (same as Products.jsx) ────────────────────────────────────
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
  const [stockSummary, setStockSummary] = useState({});
  const [locations, setLocations]       = useState([]);
  const [search, setSearch]             = useState("");
  const [openMaterials, setOpenMaterials]   = useState({});
  const [openCategories, setOpenCategories] = useState({});

  // slide-in add stock panel
  const [panelOpen, setPanelOpen]   = useState(false);
  const [panelProduct, setPanelProduct] = useState(null);
  const [form, setForm] = useState({
    location_id: "", type: "inward", qty: "", rate: "", party: "", date: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: prod }, { data: loc }, { data: stock }] = await Promise.all([
      supabase.from("products").select("*"),
      supabase.from("locations").select("*"),
      supabase.from("stock_summary").select("*"),
    ]);
    setProducts(prod || []);
    setLocations(loc || []);
    const summary = {};
    (stock || []).forEach(row => {
      if (!summary[row.product_id]) summary[row.product_id] = {};
      summary[row.product_id][row.location_name] = row.current_stock ?? row.total_stock ?? 0;
    });
    setStockSummary(summary);
  }

  const totalStock = (pid) => Object.values(stockSummary[pid] || {}).reduce((s, v) => s + v, 0);
  const stockByLoc = (pid, loc) => stockSummary[pid]?.[loc] ?? 0;

  async function toggleHero(e, product) {
    e.stopPropagation();
    const next = !product.is_hero;
    await supabase.from("products").update({ is_hero: next }).eq("id", product.id);
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_hero: next } : p));
  }

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
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">🏭 Warehouse Stock</h1>
          <p className="text-gray-500 text-sm mt-1">Live stock across all locations — click any product to log stock IN/OUT</p>
        </div>
      </div>

      {/* SEARCH */}
      <div className="mb-5">
        <input
          placeholder="Search by product ID or name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 p-2.5 rounded-xl w-full max-w-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* CATALOG TREE */}
      <div className="space-y-3">
        {materialKeys.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No products found</div>
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
                    {totalInMat} products · {catKeys.length} categories
                  </span>
                </div>
                <span className="text-xl font-light">{isMaterialOpen ? "▲" : "▼"}</span>
              </button>

              {isMaterialOpen && (
                <div className="divide-y divide-gray-100">
                  {catKeys.map(cat => {
                    const catKey = mat + "||" + cat;
                    const isCatOpen = openCategories[catKey] !== false;
                    const catProducts = sortProductsBySize(catalog[mat][cat]);

                    return (
                      <div key={cat}>
                        <button
                          onClick={() => toggleCategory(catKey)}
                          className="w-full flex items-center justify-between px-6 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-blue-800">{cat}</span>
                            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">{catProducts.length} item{catProducts.length !== 1 ? "s" : ""}</span>
                          </div>
                          <span className="text-blue-400 text-sm">{isCatOpen ? "▲" : "▼"}</span>
                        </button>

                        {isCatOpen && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <tr>
                                  <th className="px-6 py-2 text-left font-semibold">Product</th>
                                  {locations.map(l => (
                                    <th key={l.id} className="px-4 py-2 text-center font-semibold">{l.name}</th>
                                  ))}
                                  <th className="px-4 py-2 text-center font-semibold">Total</th>
                                  <th className="px-4 py-2 text-center font-semibold">⭐ Hero</th>
                                  <th className="px-4 py-2 text-center font-semibold">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catProducts.map((p, idx) => (
                                  <tr
                                    key={p.id}
                                    className={`border-t border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"} hover:bg-blue-50/30 transition-colors`}
                                  >
                                    <td className="px-6 py-3">
                                      <div className="font-medium text-gray-800">
                                        {p.product_name}
                                        {stockBadge(p)}
                                      </div>
                                      <div className="font-mono text-xs text-gray-400 mt-0.5">{p.product_id}</div>
                                    </td>
                                    {locations.map(l => (
                                      <td key={l.id} className="px-4 py-3 text-center tabular-nums text-gray-700">
                                        {stockByLoc(p.id, l.name)}
                                      </td>
                                    ))}
                                    <td className={`px-4 py-3 text-center font-bold tabular-nums text-lg ${stockColor(p)}`}>
                                      {totalStock(p.id)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <button
                                        onClick={(e) => toggleHero(e, p)}
                                        title={p.is_hero ? "Remove from hero" : "Pin as hero"}
                                        className={`text-xl transition-transform hover:scale-125 ${p.is_hero ? "opacity-100" : "opacity-30 grayscale"}`}
                                      >
                                        ⭐
                                      </button>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <button
                                        onClick={() => openPanel(p)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        + Stock
                                      </button>
                                    </td>
                                  </tr>
                                ))}
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

      {/* SLIDE-IN PANEL */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setPanelOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="px-6 py-5 bg-gradient-to-r from-blue-700 to-blue-800 text-white">
              <h2 className="text-lg font-bold">+ Add Stock Movement</h2>
              <p className="text-blue-200 text-sm mt-1 truncate">{panelProduct?.product_name}</p>
              <p className="text-blue-300 font-mono text-xs mt-0.5">{panelProduct?.product_id}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* IN / OUT toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</label>
                <div className="flex rounded-xl overflow-hidden border border-gray-300">
                  <button
                    onClick={() => setForm(f => ({ ...f, type: "inward" }))}
                    className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                      form.type === "inward" ? "bg-green-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    🟢 IN
                  </button>
                  <button
                    onClick={() => setForm(f => ({ ...f, type: "outward" }))}
                    className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                      form.type === "outward" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    🔴 OUT
                  </button>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</label>
                <select
                  value={form.location_id}
                  onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              {/* Qty */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quantity</label>
                <input
                  type="number" min="0"
                  value={form.qty}
                  onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                  placeholder="e.g. 120"
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Rate */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rate (₹) <span className="text-gray-400 normal-case font-normal">optional</span></label>
                <input
                  type="number" min="0"
                  value={form.rate}
                  onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                  placeholder="e.g. 150"
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Party */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Party / Remark <span className="text-gray-400 normal-case font-normal">optional</span></label>
                <input
                  value={form.party}
                  onChange={e => setForm(f => ({ ...f, party: e.target.value }))}
                  placeholder="Supplier name, note..."
                  className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
              <button
                onClick={handleAddStock}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
              >
                {saving ? "Saving..." : "✅ Save"}
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl transition-colors"
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
