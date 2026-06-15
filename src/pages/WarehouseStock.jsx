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

function sortProductsBySize(products) {
  return [...products].sort((a, b) => {
    const sa = extractSizeKey(a.product_name || "");
    const sb = extractSizeKey(b.product_name || "");
    if (sa !== sb) return sa - sb;
    return (a.product_id || "").localeCompare(b.product_id || "");
  });
}

function buildCatalog(products) {
  const catalog = {};
  products.forEach(p => {
    const mat = inferMaterial(p.product_name || "");
    const cat = inferCategory(p.product_name || "");
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
  // stockSummary[productUUID][locationUUID] = net qty
  const [stockSummary, setStockSummary] = useState({});
  // Only non-Office locations shown in warehouse view
  const [locations, setLocations]       = useState([]);
  const [search, setSearch]             = useState("");
  const [openMaterials, setOpenMaterials]   = useState({});
  const [openCategories, setOpenCategories] = useState({});

  // new item form
  const [showAddItem, setShowAddItem]   = useState(false);
  const [newItem, setNewItem]           = useState({ name: "", unit: "Pcs", low_stock_alert: "", openingQty: "", openingRate: "", openingLocId: "" });
  const [addingItem, setAddingItem]     = useState(false);

  // stock panel
  const [panelOpen, setPanelOpen]       = useState(false);
  const [panelProduct, setPanelProduct] = useState(null);
  const [form, setForm] = useState({
    location_id: "", type: "inward", qty: "", rate: "", party: "", date: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel("warehouse-transactions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => { loadAll(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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

    // Step 2: fetch transactions for warehouse/godown locations
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

    // Step 4: keep ALL products that ever had a warehouse transaction
    // (including 0-qty ones — so they don't vanish after full outward)
    const productIdsWithWarehouseTxns = Object.keys(summary);

    if (productIdsWithWarehouseTxns.length === 0) {
      setProducts([]);
      setStockSummary({});
      return;
    }

    const { data: prod } = await supabase
      .from("products")
      .select("*")
      .in("id", productIdsWithWarehouseTxns);

    setStockSummary(summary);
    setProducts(prod || []);
  }

  // Total warehouse stock for a product = sum across all warehouse location IDs
  const totalStock = (pid) =>
    Object.values(stockSummary[pid] || {}).reduce((s, v) => s + v, 0);

  // Stock for one specific warehouse location (by location UUID)
  const stockByLoc = (pid, locId) => stockSummary[pid]?.[locId] ?? 0;

  async function handleAddItem() {
    if (!newItem.name.trim()) { alert("Enter an item name."); return; }
    const locId = newItem.openingLocId || locations[0]?.id;
    if (!locId) { alert("No warehouse location found."); return; }
    setAddingItem(true);
    try {
      const productId = newItem.name.trim().toUpperCase().replace(/\s+/g, "-");
      const { data: inserted, error } = await supabase.from("products").insert([{
        product_id: productId,
        product_name: newItem.name.trim(),
        unit: newItem.unit || "Pcs",
        low_stock_alert: Number(newItem.low_stock_alert || 0),
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

      setNewItem({ name: "", unit: "Pcs", low_stock_alert: "", openingQty: "", openingRate: "", openingLocId: "" });
      setShowAddItem(false);
      loadAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setAddingItem(false);
    }
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
    if (total === 0)
      return <span className="ml-2 text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">Out of Stock</span>;
    if (low && total <= low)
      return <span className="ml-2 text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">⚠ Low Stock</span>;
    return null;
  };

  const stockColor = (product) => {
    const total = totalStock(product.id);
    const low = product.low_stock_alert;
    if (total === 0) return "text-red-500";
    if (low && total <= low) return "text-orange-500";
    return "text-green-600";
  };

  return (
    <div className="p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">🏭 Warehouse Stock</h1>
          <p className="text-gray-500 text-sm mt-1">Live stock across Warehouse &amp; Godown locations</p>
        </div>
        <button
          onClick={() => {
            setNewItem({ name: "", unit: "Pcs", low_stock_alert: "", openingQty: "", openingRate: "", openingLocId: locations[0]?.id || "" });
            setShowAddItem(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl shadow transition-colors"
        >
          + Add New Item
        </button>
      </div>

      {/* ADD ITEM MODAL */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Add New Warehouse Item</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Item Name</label>
                <input
                  value={newItem.name}
                  onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))}
                  placeholder="e.g. SS 304 PIPE SCH-10 25NB"
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
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Low Alert Qty</label>
                  <input
                    type="number" min="0"
                    value={newItem.low_stock_alert}
                    onChange={e => setNewItem(n => ({ ...n, low_stock_alert: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening Stock <span className="text-gray-400 normal-case font-normal">optional</span></p>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location</label>
                  <select
                    value={newItem.openingLocId}
                    onChange={e => setNewItem(n => ({ ...n, openingLocId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  >
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Qty</label>
                    <input
                      type="number" min="0"
                      value={newItem.openingQty}
                      onChange={e => setNewItem(n => ({ ...n, openingQty: e.target.value }))}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Rate (₹)</label>
                    <input
                      type="number" min="0"
                      value={newItem.openingRate}
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
          type="text"
          placeholder="Search products..."
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
            <p className="text-gray-400 text-lg font-medium">No warehouse items yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "+ Add New Item" or log a transaction with a Warehouse/Godown location</p>
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
                    const catKey = `${mat}__${cat}`;
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
                            {/* Location columns header */}
                            <div
                              className="grid px-6 py-2 bg-gray-50 border-b border-gray-200"
                              style={{ gridTemplateColumns: `1fr repeat(${locations.length + 1}, minmax(90px,130px)) 120px` }}
                            >
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</span>
                              {locations.map(l => (
                                <span key={l.id} className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">{l.name}</span>
                              ))}
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Total</span>
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Action</span>
                            </div>

                            {/* Product rows */}
                            {catProducts.map((p, idx) => (
                              <div
                                key={p.id}
                                className={`grid px-6 py-3 border-b border-gray-100 last:border-0 items-center ${
                                  idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                                } hover:bg-blue-50/30 transition-colors`}
                                style={{ gridTemplateColumns: `1fr repeat(${locations.length + 1}, minmax(90px,130px)) 120px` }}
                              >
                                <span className="text-sm text-gray-800 font-medium pr-2">
                                  {p.product_name}
                                  {stockBadge(p)}
                                </span>
                                {locations.map(l => (
                                  <span key={l.id} className={`text-sm font-semibold text-center tabular-nums ${stockColor(p)}`}>
                                    {stockByLoc(p.id, l.id)} {p.unit || "Pcs"}
                                  </span>
                                ))}
                                <span className={`text-sm font-bold text-center tabular-nums ${stockColor(p)}`}>
                                  {totalStock(p.id)} {p.unit || "Pcs"}
                                </span>
                                <div className="flex justify-center">
                                  <button
                                    onClick={() => openPanel(p)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    + Stock
                                  </button>
                                </div>
                              </div>
                            ))}
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

      {/* SLIDE-IN STOCK PANEL */}
      {panelOpen && panelProduct && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setPanelOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="px-6 py-5 bg-gradient-to-r from-blue-700 to-blue-800 text-white">
              <h2 className="text-lg font-bold">+ Add Stock Movement</h2>
              <p className="text-blue-200 text-sm mt-1 truncate">{panelProduct.product_name}</p>
              <p className="text-blue-300 text-xs mt-0.5">🏭 Warehouse / Godown</p>
            </div>

            {/* Stock per location summary */}
            <div className="px-6 pt-4">
              <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                {locations.map(l => (
                  <div key={l.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{l.name}</span>
                    <span className={`font-semibold tabular-nums ${stockColor(panelProduct)}`}>
                      {stockByLoc(panelProduct.id, l.id)} {panelProduct.unit || "Pcs"}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                  <span className="font-semibold text-gray-700">Total</span>
                  <span className={`font-bold tabular-nums ${stockColor(panelProduct)}`}>
                    {totalStock(panelProduct.id)} {panelProduct.unit || "Pcs"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</label>
                <div className="flex rounded-xl overflow-hidden border border-gray-300">
                  <button onClick={() => setForm(f => ({ ...f, type: "inward" }))} className={`flex-1 py-2.5 text-sm font-bold transition-colors ${form.type === "inward" ? "bg-green-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>🟢 IN</button>
                  <button onClick={() => setForm(f => ({ ...f, type: "outward" }))} className={`flex-1 py-2.5 text-sm font-bold transition-colors ${form.type === "outward" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>🔴 OUT</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quantity</label>
                <input type="number" min="0" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="e.g. 50" className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rate (₹) <span className="text-gray-400 normal-case font-normal">optional</span></label>
                <input type="number" min="0" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="e.g. 200" className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Party / Remark <span className="text-gray-400 normal-case font-normal">optional</span></label>
                <input value={form.party} onChange={e => setForm(f => ({ ...f, party: e.target.value }))} placeholder="Note..." className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
              <button onClick={handleAddStock} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
                {saving ? "Saving..." : "✅ Save"}
              </button>
              <button onClick={() => setPanelOpen(false)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
