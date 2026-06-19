import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";

/* ─────────────────────────────────────────
   NIVEE BRAND COLORS  (mirrors Products.jsx)
   Primary : Deep Steel Blue  #1B3A6B
   Accent  : Nivee Orange     #E8630A
   Surface : Warm White       #F8F7F4
───────────────────────────────────────── */

const CATEGORIES = [
  { key: "seamless",  label: "Seamless Pipes",      icon: "⬤", color: "#1B3A6B", light: "#EBF0FA", prefixes: ["NM-NBSMLS","NM-SMLS"] },
  { key: "polish",    label: "Polish Pipes (ERW)",   icon: "◉", color: "#E8630A", light: "#FEF0E7", prefixes: ["NM-PP"] },
  { key: "nb",        label: "NB / GI Pipes",        icon: "◎", color: "#0D7A5F", light: "#E6F5F1", prefixes: ["NM-NB"] },
  { key: "nonpolish", label: "Non-Polish Pipes",     icon: "○", color: "#7C3AED", light: "#F3EFFE", prefixes: ["NM-NMPR","NM-NPS","NM-NPR"] },
  { key: "sheets",    label: "Sheets / Plates",      icon: "▭", color: "#B45309", light: "#FEF3E2", prefixes: ["NM-SH","NM-SNO"] },
  { key: "valves",    label: "Valves",               icon: "⬡", color: "#0369A1", light: "#E0F2FE", prefixes: ["NM-VLV","NM-VALVE"] },
  { key: "fittings",  label: "Fittings & Flanges",   icon: "◈", color: "#BE185D", light: "#FCE7F3", prefixes: ["NM-FIT","NM-FLG","NM-FLNG","NM-ELB","NM-TEE","NM-RED","NM-CAP","NM-CPL"] },
  { key: "other",     label: "Others",               icon: "◇", color: "#374151", light: "#F3F4F6", prefixes: [] },
];

const VALVE_KEYWORDS   = ["valve","gate valve","ball valve","butterfly valve","globe valve","check valve","needle valve","solenoid valve"];
const FITTING_KEYWORDS = ["flange","elbow","tee","reducer","coupling","cap","fitting","union","bushing","nipple","socket","stub","olet","weldolet","sockolet"];

function getCategory(product_id, product_name) {
  const pid   = (product_id   || "").toUpperCase();
  const pname = (product_name || "").toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.key === "other") continue;
    if (cat.prefixes.some(p => pid.startsWith(p))) return cat;
  }
  if (VALVE_KEYWORDS.some(k => pname.includes(k)))   return CATEGORIES.find(c => c.key === "valves");
  if (FITTING_KEYWORDS.some(k => pname.includes(k))) return CATEGORIES.find(c => c.key === "fittings");
  const up = pname.toUpperCase();
  if (up.includes("SHEET") || up.includes("PLATE")) return CATEGORIES.find(c => c.key === "sheets");
  return CATEGORIES[CATEGORIES.length - 1];
}

const GRADE_PATTERNS = [
  { re: /\b316[Ll]?\b/i,     label: "Grade 316" },
  { re: /\b304[Ll]?\b/i,     label: "Grade 304" },
  { re: /\b202\b/i,          label: "Grade 202" },
  { re: /\b201\b/i,          label: "Grade 201" },
  { re: /\b310[Ss]?\b/i,     label: "Grade 310" },
  { re: /\b321\b/i,          label: "Grade 321" },
  { re: /SCH[-\s]?80/i,      label: "SCH-80"    },
  { re: /SCH[-\s]?40/i,      label: "SCH-40"    },
  { re: /SCH[-\s]?20/i,      label: "SCH-20"    },
  { re: /SCH[-\s]?10/i,      label: "SCH-10"    },
  { re: /\b10[\s-]?SWG\b/i,  label: "10 SWG"   },
  { re: /\b12[\s-]?SWG\b/i,  label: "12 SWG"   },
  { re: /\b14[\s-]?SWG\b/i,  label: "14 SWG"   },
  { re: /\b16[\s-]?SWG\b/i,  label: "16 SWG"   },
  { re: /\b18[\s-]?SWG\b/i,  label: "18 SWG"   },
  { re: /\b20[\s-]?SWG\b/i,  label: "20 SWG"   },
  { re: /\b22[\s-]?SWG\b/i,  label: "22 SWG"   },
  { re: /\bSWG\b/i,          label: "SWG"       },
  { re: /\bHEAVY\b/i,        label: "Heavy"     },
  { re: /\bMEDIUM\b/i,       label: "Medium"    },
  { re: /\bLIGHT\b/i,        label: "Light"     },
  { re: /\bA106\b/i,         label: "A106"      },
  { re: /\bA53\b/i,          label: "A53"       },
  { re: /\bIS[-\s]?2062\b/i, label: "IS2062"    },
  { re: /\bIS[-\s]?1239\b/i, label: "IS1239"    },
  { re: /\bIS[-\s]?3589\b/i, label: "IS3589"    },
];

const VALVE_TYPE_PATTERNS = [
  { re: /ball\s*valve/i,      label: "Ball Valve"      },
  { re: /gate\s*valve/i,      label: "Gate Valve"      },
  { re: /butterfly\s*valve/i, label: "Butterfly Valve" },
  { re: /globe\s*valve/i,     label: "Globe Valve"     },
  { re: /check\s*valve/i,     label: "Check Valve"     },
  { re: /needle\s*valve/i,    label: "Needle Valve"    },
  { re: /solenoid\s*valve/i,  label: "Solenoid Valve"  },
  { re: /valve/i,             label: "Valve (Other)"   },
];

const FITTING_TYPE_PATTERNS = [
  { re: /flange/i,   label: "Flanges"   },
  { re: /elbow/i,    label: "Elbows"    },
  { re: /tee/i,      label: "Tees"      },
  { re: /reducer/i,  label: "Reducers"  },
  { re: /coupling/i, label: "Couplings" },
  { re: /cap\b/i,    label: "Caps"      },
  { re: /union/i,    label: "Unions"    },
  { re: /nipple/i,   label: "Nipples"   },
  { re: /socket/i,   label: "Sockets"   },
  { re: /olet/i,     label: "Olets"     },
];

const GRADE_ORDER = [
  "Grade 201","Grade 202","Grade 304","Grade 316","Grade 310","Grade 321",
  "SCH-10","SCH-20","SCH-40","SCH-80",
  "10 SWG","12 SWG","14 SWG","16 SWG","18 SWG","20 SWG","22 SWG","SWG",
  "Heavy","Medium","Light",
  "A106","A53","IS2062","IS1239","IS3589","Standard",
  "Ball Valve","Butterfly Valve","Check Valve","Gate Valve","Globe Valve","Needle Valve","Solenoid Valve","Valve (Other)",
  "Caps","Couplings","Elbows","Flanges","Nipples","Olets","Reducers","Sockets","Tees","Unions",
];

function gradeSort(a, b) {
  const ai = GRADE_ORDER.indexOf(a);
  const bi = GRADE_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

function extractGrade(name, catKey) {
  if (catKey === "valves") {
    for (const { re, label } of VALVE_TYPE_PATTERNS) { if (re.test(name)) return label; }
    return "Valve (Other)";
  }
  if (catKey === "fittings") {
    for (const { re, label } of FITTING_TYPE_PATTERNS) { if (re.test(name)) return label; }
    return "Fitting (Other)";
  }
  for (const { re, label } of GRADE_PATTERNS) { if (re.test(name)) return label; }
  return "Standard";
}

function extractSizeKey(name) {
  const s = (name || "").toLowerCase();
  const nbMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:nb|mm)/);
  if (nbMatch) return parseFloat(nbMatch[1]);
  const fracs = { "1/4":0.25,"3/8":0.375,"1/2":0.5,"3/4":0.75,"1/8":0.125 };
  for (const [k,v] of Object.entries(fracs)) { if (s.includes(k)) return v; }
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  return numMatch ? parseFloat(numMatch[1]) : 9999;
}

function safeStock(v) {
  const n = Number(v) || 0;
  return Object.is(n, -0) ? 0 : n;
}

/* ── Download a blank template xlsx ── */
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["product_id", "product_name", "stock", "low_alert", "high_alert"],
    ["NM-PP-001",  "Example Pipe 25mm 304",  10, 5, 100],
  ]);
  ws["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bulk Upload");
  XLSX.writeFile(wb, "office_bulk_upload_template.xlsx");
}

export default function OfficeStock() {
  const [products, setProducts]   = useState([]);
  const [stockMap, setStockMap]   = useState({});
  const [locations, setLocations] = useState([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [openCats, setOpenCats]   = useState({});
  const [openGrades, setOpenGrades] = useState({});

  // Add stock modal
  const [stockModal, setStockModal] = useState(null);
  const [stockForm, setStockForm]   = useState({ quantity:"", notes:"", party:"", type:"inward" });
  const [saving, setSaving]         = useState(false);

  // ── Bulk Upload state ──────────────────────────────────────────────────────
  const [bulkModal, setBulkModal]     = useState(false);
  const [bulkRows, setBulkRows]       = useState([]);   // parsed preview rows
  const [bulkFile, setBulkFile]       = useState(null);
  const [bulkErrors, setBulkErrors]   = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult]   = useState(null); // { inserted, updated, skipped }
  const bulkInputRef = useRef(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try { await Promise.all([loadLocations(), loadProducts(), loadStockFromTransactions()]); }
    finally { setLoading(false); }
  };

  const loadLocations = async () => {
    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .ilike("name", "office");
    if (!error) setLocations(data || []);
  };

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("product_name", { ascending: true });
    if (!error) setProducts(data || []);
  };

  const loadStockFromTransactions = async () => {
    const map = {};
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("transactions")
        .select("product_id, location_id, transaction_type, quantity")
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) break;
      data.forEach(({ product_id, location_id, transaction_type, quantity }) => {
        if (!map[product_id]) map[product_id] = {};
        if (!map[product_id][location_id]) map[product_id][location_id] = 0;
        const q = Number(quantity) || 0;
        if (transaction_type === "inward")       map[product_id][location_id] += q;
        else if (transaction_type === "outward") map[product_id][location_id] -= q;
      });
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setStockMap(map);
  };

  const stockByLocation = useCallback(
    (uuid, locId) => safeStock(stockMap[uuid]?.[locId]),
    [stockMap]
  );

  const officeTotal = useCallback(
    (uuid) => {
      const locIds = locations.map(l => l.id);
      const total  = locIds.reduce((s, lid) => s + (stockMap[uuid]?.[lid] ?? 0), 0);
      return safeStock(total);
    },
    [stockMap, locations]
  );

  const submitStock = async () => {
    if (!stockForm.quantity || !stockModal) return;
    const qty = Number(stockForm.quantity);
    if (isNaN(qty) || qty < 0) return;
    setSaving(true);
    const loc = locations.find(l => l.id === stockModal.locId);
    if (loc) {
      await supabase.from("transactions").insert([{
        product_id:       stockModal.product.id,
        location_id:      loc.id,
        transaction_type: stockForm.type,
        quantity:         qty,
        notes:            stockForm.notes || null,
        party:            stockForm.party || null,
      }]);
    }
    setSaving(false);
    setStockModal(null);
    setStockForm({ quantity:"", notes:"", party:"", type:"inward" });
    await loadStockFromTransactions();
  };

  // ── Bulk upload: parse Excel ───────────────────────────────────────────────
  const handleBulkFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file.name);
    setBulkResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const rows = [];
      const errs = [];
      raw.forEach((row, i) => {
        const pid   = String(row["product_id"]   || row["Product ID"]   || "").trim();
        const pname = String(row["product_name"] || row["Product Name"] || "").trim();
        const stock = row["stock"]      !== "" ? Number(row["stock"])      : null;
        const low   = row["low_alert"]  !== "" ? Number(row["low_alert"])  : null;
        const high  = row["high_alert"] !== "" ? Number(row["high_alert"]) : null;
        if (!pid && !pname) { errs.push(`Row ${i + 2}: product_id and product_name both empty — skipped`); return; }
        if (stock !== null && isNaN(stock)) { errs.push(`Row ${i + 2}: invalid stock value "${row["stock"]}"`); return; }
        rows.push({ product_id: pid, product_name: pname, stock, low_alert: low, high_alert: high, _row: i + 2 });
      });
      setBulkRows(rows);
      setBulkErrors(errs);
    };
    reader.readAsArrayBuffer(file);
  };

  const submitBulkUpload = async () => {
    if (!bulkRows.length) return;
    setBulkUploading(true);
    let inserted = 0, updated = 0, skipped = 0;

    for (const row of bulkRows) {
      try {
        // Find existing product by product_id (preferred) or product_name
        let existing = null;
        if (row.product_id) {
          const { data } = await supabase
            .from("products")
            .select("id, product_id, product_name, low_stock_alert, high_stock_alert")
            .eq("product_id", row.product_id)
            .maybeSingle();
          existing = data;
        }
        if (!existing && row.product_name) {
          const { data } = await supabase
            .from("products")
            .select("id, product_id, product_name, low_stock_alert, high_stock_alert")
            .ilike("product_name", row.product_name)
            .maybeSingle();
          existing = data;
        }

        const updatePayload = {};
        if (row.product_name)  updatePayload.product_name     = row.product_name;
        if (row.low_alert  !== null) updatePayload.low_stock_alert  = row.low_alert;
        if (row.high_alert !== null) updatePayload.high_stock_alert = row.high_alert;

        if (existing) {
          // Update product meta (name, alerts)
          if (Object.keys(updatePayload).length) {
            await supabase.from("products").update(updatePayload).eq("id", existing.id);
          }
          // If stock provided, insert inward transaction to correct stock
          if (row.stock !== null && locations.length > 0) {
            const currentStock = officeTotal(existing.id);
            const diff = row.stock - currentStock;
            if (diff !== 0) {
              await supabase.from("transactions").insert([{
                product_id:       existing.id,
                location_id:      locations[0].id,
                transaction_type: diff > 0 ? "inward" : "outward",
                quantity:         Math.abs(diff),
                notes:            "Bulk upload stock adjustment",
              }]);
            }
          }
          updated++;
        } else {
          // Insert new product
          const insertPayload = {
            product_name:      row.product_name || row.product_id,
            product_id:        row.product_id   || null,
            low_stock_alert:   row.low_alert    ?? null,
            high_stock_alert:  row.high_alert   ?? null,
          };
          const { data: newProd, error: insertErr } = await supabase
            .from("products")
            .insert([insertPayload])
            .select()
            .single();
          if (!insertErr && newProd && row.stock > 0 && locations.length > 0) {
            await supabase.from("transactions").insert([{
              product_id:       newProd.id,
              location_id:      locations[0].id,
              transaction_type: "inward",
              quantity:         row.stock,
              notes:            "Bulk upload initial stock",
            }]);
          }
          inserted++;
        }
      } catch {
        skipped++;
      }
    }

    setBulkResult({ inserted, updated, skipped });
    setBulkUploading(false);
    await loadAll();
  };

  const closeBulkModal = () => {
    setBulkModal(false);
    setBulkRows([]);
    setBulkErrors([]);
    setBulkFile(null);
    setBulkResult(null);
    if (bulkInputRef.current) bulkInputRef.current.value = "";
  };

  // ── Filter + group ─────────────────────────────────────────────────────────
  const filtered = products
    .filter(p =>
      (p.product_name||"").toLowerCase().includes(search.toLowerCase()) ||
      (p.product_id||"").toLowerCase().includes(search.toLowerCase())
    )
    .filter(p => officeTotal(p.id) !== 0 || search)
    .sort((a,b) => (a.product_name||"").localeCompare(b.product_name||""));

  const grouped = {};
  filtered.forEach(p => {
    const cat   = getCategory(p.product_id, p.product_name);
    const grade = extractGrade(p.product_name, cat.key);
    if (!grouped[cat.key]) grouped[cat.key] = { cat, grades: {} };
    if (!grouped[cat.key].grades[grade]) grouped[cat.key].grades[grade] = [];
    grouped[cat.key].grades[grade].push(p);
  });
  Object.values(grouped).forEach(({ grades }) => {
    Object.keys(grades).forEach(g => {
      grades[g].sort((a,b) => extractSizeKey(a.product_name) - extractSizeKey(b.product_name));
    });
  });

  const catOrder      = CATEGORIES.map(c => c.key).filter(k => grouped[k]);
  const lowStockCount = products.filter(p =>
    p.low_stock_alert && officeTotal(p.id) <= Number(p.low_stock_alert) && officeTotal(p.id) > 0
  ).length;

  const toggleCat   = (key) => setOpenCats(prev   => ({ ...prev, [key]: !prev[key] }));
  const toggleGrade = (key) => setOpenGrades(prev  => ({ ...prev, [key]: !prev[key] }));

  return (
    <div style={{ background:"#F8F7F4", minHeight:"100vh" }} className="p-4 md:p-6 max-w-screen-xl mx-auto">

      {/* ── HEADER ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div style={{ background:"#1B3A6B", borderRadius:10 }} className="w-9 h-9 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
                <line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
            </div>
            <h1 style={{ color:"#1B3A6B" }} className="text-2xl font-black tracking-tight">Office Stock</h1>
          </div>
          <div className="ml-12 flex flex-col gap-0.5">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{filtered.length}</span> products with stock
              {locations.length > 0 && <> · <span className="text-gray-400">{locations.map(l => l.name).join(", ")}</span></>}
              {lowStockCount > 0 && <> · <span style={{ color:"#E8630A" }} className="font-semibold">{lowStockCount} low stock</span></>}
            </p>
          </div>
        </div>

        {/* ── BULK UPLOAD BUTTON ── */}
        <button
          onClick={() => setBulkModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background:"#1B3A6B" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Bulk Upload
        </button>
      </div>

      {/* ── SEARCH ── */}
      <div className="relative mb-5">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          placeholder="Search by product ID or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none bg-white shadow-sm"
        />
      </div>

      {/* ── CATEGORY PILLS ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.filter(c => grouped[c.key]).map(c => (
          <button
            key={c.key}
            onClick={() => toggleCat(c.key)}
            style={{
              background: openCats[c.key] === false ? c.light : c.color,
              color:      openCats[c.key] === false ? c.color : "#fff",
              border:     `1.5px solid ${c.color}`,
            }}
            className="px-3 py-1 rounded-full text-xs font-bold transition-all"
          >
            {c.icon} {c.label} ({Object.values(grouped[c.key]?.grades||{}).flat().length})
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin mr-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Loading office stock…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="mx-auto mb-3 opacity-40" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
          </svg>
          <p className="font-semibold">No office stock found</p>
          <p className="text-sm mt-1">{search ? "Try a different search term" : "Add inward transactions for the office location to see stock here"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {catOrder.map(catKey => {
            const { cat, grades } = grouped[catKey];
            const totalProducts   = Object.values(grades).flat().length;
            const totalQty        = Object.values(grades).flat().reduce((s,p) => s + officeTotal(p.id), 0);
            const isOpen          = openCats[catKey] !== false;

            return (
              <div key={catKey} className="rounded-2xl overflow-hidden shadow-sm" style={{ border:`1.5px solid ${cat.color}22` }}>

                {/* Category header */}
                <button
                  onClick={() => toggleCat(catKey)}
                  className="w-full flex items-center justify-between px-5 py-4 transition-colors text-left"
                  style={{ background: cat.light }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm" style={{ background: cat.color }}>
                      {cat.icon}
                    </div>
                    <div>
                      <p className="font-black text-base" style={{ color: cat.color }}>{cat.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {totalProducts} product{totalProducts !== 1 ? "s" : ""} · {totalQty.toLocaleString()} units · {Object.keys(grades).length} group{Object.keys(grades).length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <svg
                    className="transition-transform"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: cat.color }}
                    width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  >
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>

                {isOpen && (
                  <div className="bg-white">
                    {Object.keys(grades).sort(gradeSort).map(grade => {
                      const gradeKey    = `${catKey}-${grade}`;
                      const isGradeOpen = openGrades[gradeKey] !== false;
                      const items       = grades[grade];
                      const gradeQty    = items.reduce((s,p) => s + officeTotal(p.id), 0);

                      return (
                        <div key={grade} className="border-t border-gray-50">

                          {/* Grade sub-header */}
                          <button
                            onClick={() => toggleGrade(gradeKey)}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition text-left"
                            style={{ background:"#FAFAF9" }}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold text-white" style={{ background: cat.color }}>{grade}</span>
                              <span className="text-sm font-semibold text-gray-600">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                              <span className="text-xs text-gray-400">· {gradeQty.toLocaleString()} units</span>
                            </div>
                            <svg
                              className="transition-transform text-gray-400"
                              style={{ transform: isGradeOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            >
                              <path d="m6 9 6 6 6-6"/>
                            </svg>
                          </button>

                          {isGradeOpen && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr style={{ background: cat.light }} className="text-xs font-bold uppercase tracking-wide">
                                    <th className="px-4 py-2.5 text-left"   style={{ color: cat.color }}>Product ID</th>
                                    <th className="px-4 py-2.5 text-left"   style={{ color: cat.color }}>Name</th>
                                    {locations.map(l => (
                                      <th key={l.id} className="px-4 py-2.5 text-center" style={{ color: cat.color }}>
                                        {l.name}
                                      </th>
                                    ))}
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Total</th>
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Alert</th>
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {items.map(p => {
                                    const total = officeTotal(p.id);
                                    const isLow = p.low_stock_alert && total > 0 && total <= Number(p.low_stock_alert);
                                    return (
                                      <tr key={p.id} className={`transition hover:bg-orange-50/20 ${isLow ? "bg-red-50/40" : ""}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                                          {p.product_id || "—"}
                                        </td>
                                        <td className="px-4 py-3 font-semibold" style={{ color:"#1B3A6B" }}>
                                          {p.product_name}
                                          {isLow && (
                                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">⚠ Low</span>
                                          )}
                                        </td>

                                        {locations.map(l => {
                                          const locQty = stockByLocation(p.id, l.id);
                                          return (
                                            <td key={l.id} className="px-4 py-3 text-center">
                                              <span
                                                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums"
                                                style={{ background:"#EBF0FA", color:"#1B3A6B" }}
                                              >
                                                {locQty}
                                              </span>
                                            </td>
                                          );
                                        })}

                                        <td className="px-4 py-3 text-center">
                                          <span className="font-black tabular-nums text-gray-800">{total}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isLow ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                                            {p.low_stock_alert || "—"}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                            {locations.length === 1 ? (
                                              <button
                                                onClick={() => {
                                                  setStockModal({ product: p, locId: locations[0].id });
                                                  setStockForm({ quantity:"", notes:"", party:"", type:"inward" });
                                                }}
                                                className="text-xs px-2.5 py-1 rounded-md font-medium"
                                                style={{ background:"#EBF0FA", color:"#1B3A6B" }}
                                              >
                                                + Stock
                                              </button>
                                            ) : (
                                              <div className="relative group">
                                                <button
                                                  className="text-xs px-2.5 py-1 rounded-md font-medium"
                                                  style={{ background:"#EBF0FA", color:"#1B3A6B" }}
                                                >
                                                  + Stock ▾
                                                </button>
                                                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-10 hidden group-hover:block min-w-[140px] overflow-hidden">
                                                  {locations.map(loc => (
                                                    <button
                                                      key={loc.id}
                                                      onClick={e => {
                                                        e.stopPropagation();
                                                        setStockModal({ product: p, locId: loc.id });
                                                        setStockForm({ quantity:"", notes:"", party:"", type:"inward" });
                                                      }}
                                                      className="block w-full text-left px-4 py-2.5 text-xs hover:bg-orange-50 capitalize font-medium text-gray-700"
                                                    >
                                                      {loc.name}
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
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
      )}

      {/* ── ADD STOCK MODAL ── */}
      {stockModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          onClick={() => setStockModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-black text-lg mb-1" style={{ color:"#1B3A6B" }}>Stock Movement</h3>
            <p className="text-sm text-gray-500 mb-1">{stockModal.product.product_name}</p>
            <p className="text-xs font-semibold mb-4" style={{ color:"#1B3A6B" }}>
              🏢 {locations.find(l => l.id === stockModal.locId)?.name || "Office"}
            </p>

            <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-4">
              <button
                onClick={() => setStockForm(f => ({ ...f, type:"inward" }))}
                className={`flex-1 py-2.5 text-sm font-bold transition-colors ${stockForm.type === "inward" ? "bg-green-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                ▲ IN
              </button>
              <button
                onClick={() => setStockForm(f => ({ ...f, type:"outward" }))}
                className={`flex-1 py-2.5 text-sm font-bold transition-colors ${stockForm.type === "outward" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                ▼ OUT
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="number"
                placeholder="Quantity *"
                value={stockForm.quantity}
                onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                className="w-full border border-gray-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none"
              />
              <input
                placeholder="Party name (optional)"
                value={stockForm.party}
                onChange={e => setStockForm({ ...stockForm, party: e.target.value })}
                className="w-full border border-gray-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none"
              />
              <textarea
                placeholder="Notes (optional)"
                value={stockForm.notes}
                onChange={e => setStockForm({ ...stockForm, notes: e.target.value })}
                rows={2}
                className="w-full border border-gray-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStockModal(null)}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitStock}
                disabled={saving || !stockForm.quantity}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background:"#1B3A6B" }}
              >
                {saving ? "Saving…" : stockForm.type === "inward" ? "Add Stock" : "Remove Stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK UPLOAD MODAL ── */}
      {bulkModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          onClick={closeBulkModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"#EBF0FA" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-black text-lg" style={{ color:"#1B3A6B" }}>Bulk Upload</h3>
                  <p className="text-xs text-gray-400">Upload Excel with product data</p>
                </div>
              </div>
              <button onClick={closeBulkModal} className="text-gray-400 hover:text-gray-600 p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Required columns info */}
            <div className="rounded-xl p-4 mb-4 text-sm" style={{ background:"#EBF0FA" }}>
              <p className="font-bold text-xs uppercase tracking-wide mb-2" style={{ color:"#1B3A6B" }}>Required columns in your Excel file</p>
              <div className="flex flex-wrap gap-2">
                {["product_id","product_name","stock","low_alert","high_alert"].map(col => (
                  <code key={col} className="px-2 py-0.5 rounded text-xs font-mono font-bold" style={{ background:"#1B3A6B", color:"#fff" }}>{col}</code>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                • <strong>product_id</strong> or <strong>product_name</strong> required (both recommended)<br/>
                • <strong>stock</strong> sets absolute quantity — a correcting transaction is created automatically<br/>
                • <strong>low_alert</strong> / <strong>high_alert</strong> update the product's alert thresholds<br/>
                • Existing products are updated; new products are created
              </p>
            </div>

            {/* Download template */}
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 text-xs font-semibold mb-4 hover:opacity-80 transition-opacity"
              style={{ color:"#1B3A6B" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download blank template (.xlsx)
            </button>

            {/* File picker */}
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 transition-colors mb-4"
              style={{ background:"#FAFAF9" }}
              onClick={() => bulkInputRef.current?.click()}
            >
              <svg className="mx-auto mb-2 text-gray-300" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              {bulkFile
                ? <p className="text-sm font-semibold text-gray-700">{bulkFile}</p>
                : <p className="text-sm text-gray-400">Click to choose .xlsx or .xls file</p>
              }
              <input
                ref={bulkInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleBulkFile}
              />
            </div>

            {/* Parse errors */}
            {bulkErrors.length > 0 && (
              <div className="rounded-xl p-3 mb-4 bg-red-50 border border-red-100">
                <p className="text-xs font-bold text-red-600 mb-1">⚠ {bulkErrors.length} row{bulkErrors.length > 1 ? "s" : ""} skipped</p>
                {bulkErrors.map((e, i) => <p key={i} className="text-xs text-red-500">{e}</p>)}
              </div>
            )}

            {/* Preview table */}
            {bulkRows.length > 0 && !bulkResult && (
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{bulkRows.length} rows ready to upload</p>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background:"#EBF0FA" }}>
                        {["product_id","product_name","stock","low_alert","high_alert"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wide" style={{ color:"#1B3A6B" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {bulkRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-gray-400">{row.product_id || "—"}</td>
                          <td className="px-3 py-2 font-semibold text-gray-700">{row.product_name || "—"}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{row.stock ?? "—"}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{row.low_alert ?? "—"}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{row.high_alert ?? "—"}</td>
                        </tr>
                      ))}
                      {bulkRows.length > 10 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-center text-gray-400 italic">
                            …and {bulkRows.length - 10} more rows
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Success result */}
            {bulkResult && (
              <div className="rounded-xl p-4 mb-4 border" style={{ background:"#E6F5F1", borderColor:"#0D7A5F33" }}>
                <p className="font-black text-sm mb-1" style={{ color:"#0D7A5F" }}>✓ Upload complete</p>
                <div className="flex gap-4 text-sm">
                  <span><strong>{bulkResult.inserted}</strong> <span className="text-gray-500">new products</span></span>
                  <span><strong>{bulkResult.updated}</strong>  <span className="text-gray-500">updated</span></span>
                  {bulkResult.skipped > 0 && <span><strong className="text-red-500">{bulkResult.skipped}</strong> <span className="text-gray-500">failed</span></span>}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={closeBulkModal}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                {bulkResult ? "Close" : "Cancel"}
              </button>
              {!bulkResult && (
                <button
                  onClick={submitBulkUpload}
                  disabled={bulkUploading || bulkRows.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background:"#1B3A6B" }}
                >
                  {bulkUploading ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Uploading…
                    </>
                  ) : (
                    <>Upload {bulkRows.length} row{bulkRows.length !== 1 ? "s" : ""}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
