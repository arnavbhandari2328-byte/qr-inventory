import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

/* ─────────────────────────────────────────
   NIVEE BRAND COLORS
   Primary: Deep Steel Blue  #1B3A6B
   Accent:  Nivee Orange     #E8630A
   Surface: Warm White       #F8F7F4
───────────────────────────────────────── */

const CATEGORIES = [
  { key: "seamless",  label: "Seamless Pipes",       icon: "⬤",  color: "#1B3A6B", light: "#EBF0FA", prefixes: ["NM-NBSMLS","NM-SMLS"] },
  { key: "polish",    label: "Polish Pipes (ERW)",    icon: "◉",  color: "#E8630A", light: "#FEF0E7", prefixes: ["NM-PP"] },
  { key: "nb",        label: "NB / GI Pipes",        icon: "◎",  color: "#0D7A5F", light: "#E6F5F1", prefixes: ["NM-NB"] },
  { key: "nonpolish", label: "Non-Polish Pipes",     icon: "○",  color: "#7C3AED", light: "#F3EFFE", prefixes: ["NM-NMPR","NM-NPS","NM-NPR"] },
  { key: "sheets",    label: "Sheets / Plates",      icon: "▭",  color: "#B45309", light: "#FEF3E2", prefixes: ["NM-SH","NM-SNO"] },
  { key: "valves",    label: "Valves",               icon: "⬡",  color: "#0369A1", light: "#E0F2FE", prefixes: ["NM-VLV","NM-VALVE","NM-VLV"] },
  { key: "fittings",  label: "Fittings & Flanges",   icon: "◈",  color: "#BE185D", light: "#FCE7F3", prefixes: ["NM-FIT","NM-FLG","NM-FLNG","NM-ELB","NM-TEE","NM-RED","NM-CAP","NM-CPL"] },
  { key: "other",     label: "Others",               icon: "◇",  color: "#374151", light: "#F3F4F6", prefixes: [] },
];

const VALVE_KEYWORDS    = ["valve","gate valve","ball valve","butterfly valve","globe valve","check valve","needle valve","solenoid valve"];
const FITTING_KEYWORDS  = ["flange","elbow","tee","reducer","coupling","cap","fitting","union","bushing","nipple","socket","stub","olet","weldolet","sockolet"];

function getCategory(product_id, product_name) {
  const pid   = (product_id   || "").toUpperCase();
  const pname = (product_name || "").toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.key === "other") continue;
    if (cat.prefixes.some(p => pid.startsWith(p))) return cat;
  }
  if (VALVE_KEYWORDS.some(k => pname.includes(k)))   return CATEGORIES.find(c => c.key === "valves");
  if (FITTING_KEYWORDS.some(k => pname.includes(k))) return CATEGORIES.find(c => c.key === "fittings");
  const pnameUpper = pname.toUpperCase();
  if (pnameUpper.includes("SHEET") || pnameUpper.includes("PLATE")) return CATEGORIES.find(c => c.key === "sheets");
  return CATEGORIES[CATEGORIES.length - 1];
}

const GRADE_PATTERNS = [
  { re: /\b316[Ll]?\b/i,          label: "Grade 316"  },
  { re: /\b304[Ll]?\b/i,          label: "Grade 304"  },
  { re: /\b202\b/i,               label: "Grade 202"  },
  { re: /\b201\b/i,               label: "Grade 201"  },
  { re: /\b310[Ss]?\b/i,          label: "Grade 310"  },
  { re: /\b321\b/i,               label: "Grade 321"  },
  { re: /SCH[-\s]?80/i,           label: "SCH-80"     },
  { re: /SCH[-\s]?40/i,           label: "SCH-40"     },
  { re: /SCH[-\s]?20/i,           label: "SCH-20"     },
  { re: /SCH[-\s]?10/i,           label: "SCH-10"     },
  { re: /\b10[\s-]?SWG\b/i,       label: "10 SWG"    },
  { re: /\b12[\s-]?SWG\b/i,       label: "12 SWG"    },
  { re: /\b14[\s-]?SWG\b/i,       label: "14 SWG"    },
  { re: /\b16[\s-]?SWG\b/i,       label: "16 SWG"    },
  { re: /\b18[\s-]?SWG\b/i,       label: "18 SWG"    },
  { re: /\b20[\s-]?SWG\b/i,       label: "20 SWG"    },
  { re: /\b22[\s-]?SWG\b/i,       label: "22 SWG"    },
  { re: /\bSWG\b/i,               label: "SWG"        },
  { re: /\bHEAVY\b/i,             label: "Heavy"      },
  { re: /\bMEDIUM\b/i,            label: "Medium"     },
  { re: /\bLIGHT\b/i,             label: "Light"      },
  { re: /\bA106\b/i,              label: "A106"       },
  { re: /\bA53\b/i,               label: "A53"        },
  { re: /\bIS[-\s]?2062\b/i,      label: "IS2062"     },
  { re: /\bIS[-\s]?1239\b/i,      label: "IS1239"     },
  { re: /\bIS[-\s]?3589\b/i,      label: "IS3589"     },
];

const VALVE_TYPE_PATTERNS = [
  { re: /ball\s*valve/i,       label: "Ball Valve"       },
  { re: /gate\s*valve/i,       label: "Gate Valve"       },
  { re: /butterfly\s*valve/i,  label: "Butterfly Valve"  },
  { re: /globe\s*valve/i,      label: "Globe Valve"      },
  { re: /check\s*valve/i,      label: "Check Valve"      },
  { re: /needle\s*valve/i,     label: "Needle Valve"     },
  { re: /solenoid\s*valve/i,   label: "Solenoid Valve"   },
  { re: /valve/i,              label: "Valve (Other)"    },
];

const FITTING_TYPE_PATTERNS = [
  { re: /flange/i,     label: "Flanges"      },
  { re: /elbow/i,      label: "Elbows"       },
  { re: /tee/i,        label: "Tees"         },
  { re: /reducer/i,    label: "Reducers"     },
  { re: /coupling/i,   label: "Couplings"    },
  { re: /cap\b/i,      label: "Caps"         },
  { re: /union/i,      label: "Unions"       },
  { re: /nipple/i,     label: "Nipples"      },
  { re: /socket/i,     label: "Sockets"      },
  { re: /olet/i,       label: "Olets"        },
];

const GRADE_ORDER = [
  "Grade 201","Grade 202","Grade 304","Grade 316","Grade 310","Grade 321",
  "SCH-10","SCH-20","SCH-40","SCH-80",
  "10 SWG","12 SWG","14 SWG","16 SWG","18 SWG","20 SWG","22 SWG","SWG",
  "Heavy","Medium","Light",
  "A106","A53","IS2062","IS1239","IS3589",
  "Standard",
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

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    + " " + d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true });
}

export default function Products() {
  const [products, setProducts]     = useState([]);
  const [stockMap, setStockMap]     = useState({});
  const [locations, setLocations]   = useState([]);
  const [latestTally, setLatestTally] = useState(null);
  const [search, setSearch]         = useState("");
  const [activeCat, setActiveCat]   = useState(null); // null = show all
  const [loading, setLoading]       = useState(true);
  const [openCats, setOpenCats]     = useState({});
  const [openGrades, setOpenGrades] = useState({});

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [ledger, setLedger]         = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm]             = useState({ product_id:"", product_name:"", low_stock_alert:"" });
  const [saving, setSaving]         = useState(false);

  const [stockModal, setStockModal] = useState(null);
  const [stockForm, setStockForm]   = useState({ quantity:"", notes:"", party:"" });

  const [editingId, setEditingId]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [showTallyAll, setShowTallyAll] = useState(false);
  const [tallyAllConfirming, setTallyAllConfirming] = useState(false);

  const [showBulk, setShowBulk]     = useState(false);
  const [bulkRows, setBulkRows]     = useState([]);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try { await Promise.all([loadProducts(), loadLocations(), loadStockFromTransactions(), loadLatestTally()]); }
    finally { setLoading(false); }
  };

  const loadProducts = async () => {
    const { data, error } = await supabase.from("products").select("*").order("product_name", { ascending: true });
    if (!error) setProducts(data || []);
  };

  const loadLocations = async () => {
    const { data, error } = await supabase.from("locations").select("*");
    if (!error) setLocations(data || []);
  };

  const loadLatestTally = async () => {
    const { data, error } = await supabase
      .from("tally_logs")
      .select("tallied_at, tallied_by, location_type")
      .order("tallied_at", { ascending: false })
      .limit(1)
      .single();
    if (!error && data) setLatestTally(data);
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
        if (transaction_type === "inward") map[product_id][location_id] += q;
        else if (transaction_type === "outward") map[product_id][location_id] -= q;
      });
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setStockMap(map);
  };

  const stockByLocation = useCallback((uuid, locId) => safeStock(stockMap[uuid]?.[locId]), [stockMap]);
  const totalStock = useCallback((uuid) => safeStock(Object.values(stockMap[uuid] || {}).reduce((s,v)=>s+v,0)), [stockMap]);
  const getLocId   = (name) => locations.find(l => l.name?.toLowerCase() === name.toLowerCase())?.id;
  const officeStock    = (uuid) => stockByLocation(uuid, getLocId("office"));
  const warehouseStock = (uuid) => stockByLocation(uuid, getLocId("warehouse"));

  const handleTallyAll = async () => {
    setTallyAllConfirming(true);
    const now = new Date().toISOString();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("tally_logs").insert([{
      tallied_at: now,
      tallied_by: user?.email || "unknown",
      location_type: "office",
    }]);
    setLatestTally({ tallied_at: now, tallied_by: user?.email || "unknown", location_type: "office" });
    setTallyAllConfirming(false);
    setShowTallyAll(false);
  };

  const openLedger = async (product) => {
    setSelectedProduct(product);
    setLedgerLoading(true);
    setLedger([]);
    const { data, error } = await supabase.from("transactions").select("*").eq("product_id", product.id).order("created_at", { ascending: true });
    if (!error && data) {
      let balance = 0;
      setLedger(data.map(t => {
        const q = Number(t.quantity) || 0;
        if (t.transaction_type === "inward") balance += q; else balance -= q;
        return { ...t, balance: safeStock(balance) };
      }));
    }
    setLedgerLoading(false);
  };

  const handleAddProduct = async () => {
    if (!form.product_name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("products").insert([{
      product_id: form.product_id.trim() || null,
      product_name: form.product_name.trim(),
      low_stock_alert: form.low_stock_alert ? Number(form.low_stock_alert) : null,
    }]);
    setSaving(false);
    if (!error) { setForm({ product_id:"", product_name:"", low_stock_alert:"" }); setShowAddForm(false); await loadProducts(); }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      product_id: "NM-PP-001",
      product_name: "Example Product 25NB 304",
      stock: 100,
      low_alert: 10,
      high_alert: 500,
      location: "warehouse",
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Nivee_Bulk_Upload_Template.xlsx");
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const errors = [];
        const rows = raw.map((r, i) => {
          const name = String(r.product_name || r.Product_Name || r["Product Name"] || "").trim();
          if (!name) errors.push(`Row ${i+2}: product_name is required`);
          const stockVal = r.stock !== undefined ? r.stock : r.Stock !== undefined ? r.Stock : r["Stock"] !== undefined ? r["Stock"] : "";
          const stockNum = stockVal !== "" ? Number(stockVal) || 0 : null;
          const lowVal = r.low_alert !== undefined ? r.low_alert : r.Low_Alert !== undefined ? r.Low_Alert : r["Low Alert"] !== undefined ? r["Low Alert"] : r.low_stock_alert !== undefined ? r.low_stock_alert : "";
          const lowNum = lowVal !== "" ? Number(lowVal) || null : null;
          const highVal = r.high_alert !== undefined ? r.high_alert : r.High_Alert !== undefined ? r.High_Alert : r["High Alert"] !== undefined ? r["High Alert"] : "";
          const highNum = highVal !== "" ? Number(highVal) || null : null;
          const locationName = String(r.location || r.Location || r["Location"] || "").trim().toLowerCase() || null;
          return {
            product_id:      String(r.product_id || r.Product_ID || r["Product ID"] || "").trim() || null,
            product_name:    name,
            low_stock_alert: lowNum,
            high_stock_alert: highNum,
            _stock:          stockNum,
            _location:       locationName,
          };
        }).filter(r => r.product_name);
        setBulkRows(rows);
        setBulkErrors(errors);
      } catch {
        setBulkErrors(["Could not parse file. Please use the template."]);
        setBulkRows([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return;
    setBulkSaving(true);
    const CHUNK = 50;
    const productPayloads = bulkRows.map(({ _stock, _location, ...rest }) => rest);
    for (let i = 0; i < productPayloads.length; i += CHUNK) {
      await supabase.from("products").upsert(productPayloads.slice(i, i + CHUNK), { onConflict: "product_name" });
    }
    const rowsWithStock = bulkRows.filter(r => r._stock !== null && r._stock > 0);
    if (rowsWithStock.length > 0) {
      const { data: freshProducts } = await supabase.from("products").select("id, product_name");
      const nameToId = {};
      (freshProducts || []).forEach(p => { nameToId[p.product_name] = p.id; });
      const txns = [];
      for (const row of rowsWithStock) {
        const productUUID = nameToId[row.product_name];
        if (!productUUID) continue;
        let locId = null;
        if (row._location) {
          const matched = locations.find(l => l.name?.toLowerCase() === row._location);
          if (matched) locId = matched.id;
        }
        if (!locId && locations.length > 0) locId = locations[0].id;
        if (!locId) continue;
        txns.push({ product_id: productUUID, location_id: locId, transaction_type: "inward", quantity: row._stock, notes: "Bulk upload opening stock" });
      }
      for (let i = 0; i < txns.length; i += CHUNK) {
        await supabase.from("transactions").insert(txns.slice(i, i + CHUNK));
      }
    }
    setBulkSaving(false);
    setShowBulk(false);
    setBulkRows([]);
    setBulkErrors([]);
    if (fileRef.current) fileRef.current.value = "";
    await loadAll();
  };

  const handleDelete = async (id) => {
    await supabase.from("products").delete().eq("id", id);
    setDeleteConfirm(null);
    await loadProducts();
    await loadStockFromTransactions();
  };

  const startEdit = (p) => { setEditingId(p.id); setEditForm({ product_name: p.product_name, product_id: p.product_id, low_stock_alert: p.low_stock_alert }); };
  const saveEdit  = async (id) => {
    await supabase.from("products").update({ product_name: editForm.product_name, product_id: editForm.product_id, low_stock_alert: editForm.low_stock_alert ? Number(editForm.low_stock_alert) : null }).eq("id", id);
    setEditingId(null);
    await loadProducts();
  };

  const submitStock = async () => {
    if (!stockForm.quantity || !stockModal) return;
    const qty = Number(stockForm.quantity);
    if (isNaN(qty) || qty < 0) return;
    const locs = stockModal.mode === "both"
      ? locations.filter(l => ["office","warehouse"].includes(l.name?.toLowerCase()))
      : locations.filter(l => l.name?.toLowerCase() === stockModal.mode.toLowerCase());
    for (const loc of locs) {
      await supabase.from("transactions").insert([{ product_id: stockModal.product.id, location_id: loc.id, transaction_type: "inward", quantity: qty, notes: stockForm.notes || null, party: stockForm.party || null }]);
    }
    setStockModal(null);
    setStockForm({ quantity:"", notes:"", party:"" });
    await loadStockFromTransactions();
  };

  const handleExportExcel = () => {
    if (!products.length) return;
    const rows = [];
    catOrder.forEach(catKey => {
      const { cat, grades } = grouped[catKey];
      Object.keys(grades).sort(gradeSort).forEach(grade => {
        grades[grade].forEach(p => {
          rows.push({
            Category:    cat.label,
            Grade:       grade,
            Product_ID:  p.product_id || "",
            Product_Name: p.product_name,
            Office:      officeStock(p.id),
            Warehouse:   warehouseStock(p.id),
            Total:       totalStock(p.id),
            Low_Alert:   p.low_stock_alert || "",
            Last_Tallied: latestTally ? formatDateTime(latestTally.tallied_at) : "",
          });
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, `Nivee_Products_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleExportTally = () => {
    if (!products.length) return;
    const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const stockItems = products.map(p => {
      const total = totalStock(p.id);
      return `\n    <STOCKITEM NAME="${esc(p.product_name)}" RESERVEDNAME="">\n      <PARENT></PARENT>\n      <CATEGORY></CATEGORY>\n      <BASEUNITS>NOS</BASEUNITS>\n      <OPENINGBALANCE>${total}</OPENINGBALANCE>\n      <OPENINGRATE>0</OPENINGRATE>\n      <OPENINGVALUE>0</OPENINGVALUE>\n      <BATCHALLOCATIONS.LIST></BATCHALLOCATIONS.LIST>\n    </STOCKITEM>`;
    }).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Stock Items</REPORTNAME>\n        <STATICVARIABLES>\n          <SVCURRENTCOMPANY>Nivee Metal</SVCURRENTCOMPANY>\n        </STATICVARIABLES>\n      </REQUESTDESC>\n      <REQUESTDATA>\n        <TALLYMESSAGE xmlns:UDF="TallyUDF">${stockItems}\n        </TALLYMESSAGE>\n      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;
    const blob = new Blob([xml], { type: "text/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Nivee_Tally_${new Date().toISOString().slice(0,10)}.xml`;
    a.click();
  };

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return { r, g, b };
  }
  function hexToRgbArr(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    if (alpha !== undefined) {
      return [Math.round(255-(255-r)*alpha), Math.round(255-(255-g)*alpha), Math.round(255-(255-b)*alpha)];
    }
    return [r, g, b];
  }

  const handleExportPDF = () => {
    if (!products.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(27, 58, 107);
    doc.rect(0, 0, pageW, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("NIVEE METAL — Products Catalog", 14, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}`, pageW - 14, 12, { align: "right" });
    let y = 24;
    catOrder.forEach(catKey => {
      const { cat, grades } = grouped[catKey];
      const allItems = Object.values(grades).flat();
      const catTotal = allItems.reduce((s,p) => s + totalStock(p.id), 0);
      const rgb = hexToRgb(cat.color);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(0, y, pageW, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`${cat.label}  (${allItems.length} products · ${catTotal.toLocaleString()} units)`, 14, y + 5.5);
      y += 10;
      Object.keys(grades).sort(gradeSort).forEach(grade => {
        const items = grades[grade];
        const tallyLabel = latestTally ? formatDateTime(latestTally.tallied_at) : "—";
        const rows = items.map(p => [
          p.product_id || "—",
          p.product_name,
          officeStock(p.id),
          warehouseStock(p.id),
          totalStock(p.id),
          p.low_stock_alert || "—",
          tallyLabel,
        ]);
        doc.autoTable({
          startY: y,
          head: [[
            { content: `${grade}`, colSpan: 7, styles: { fillColor: hexToRgbArr(cat.color, 0.15), textColor: hexToRgbArr(cat.color), fontStyle: "bold", fontSize: 8 } }
          ], ["Product ID", "Name", "Office", "Warehouse", "Total", "Alert", "Last Tallied"]],
          body: rows,
          theme: "grid",
          styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
          headStyles: { fillColor: hexToRgbArr(cat.color), textColor: [255,255,255], fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          columnStyles: {
            0: { cellWidth: 26, font: "courier" },
            1: { cellWidth: "auto" },
            2: { cellWidth: 18, halign: "center" },
            3: { cellWidth: 22, halign: "center" },
            4: { cellWidth: 16, halign: "center", fontStyle: "bold" },
            5: { cellWidth: 16, halign: "center" },
            6: { cellWidth: 34, halign: "center" },
          },
          margin: { left: 10, right: 10 },
          didDrawPage: () => {
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
          },
        });
        y = doc.lastAutoTable.finalY + 4;
        if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 14; }
      });
      y += 4;
    });
    doc.save(`Nivee_Products_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // ── Grouped data ─────────────────────────────────────────────────────────────
  const filtered = products
    .filter(p => (p.product_name||"").toLowerCase().includes(search.toLowerCase()) || (p.product_id||"").toLowerCase().includes(search.toLowerCase()))
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

  const catOrder = CATEGORIES.map(c => c.key).filter(k => grouped[k]);

  // Category counts for pills (based on ALL products, not filtered)
  const catCounts = {};
  products.forEach(p => {
    const cat = getCategory(p.product_id, p.product_name);
    catCounts[cat.key] = (catCounts[cat.key] || 0) + 1;
  });

  // If activeCat is set, only show that category
  const visibleCatOrder = activeCat ? catOrder.filter(k => k === activeCat) : catOrder;

  const lowStockCount = products.filter(p => p.low_stock_alert && totalStock(p.id) <= Number(p.low_stock_alert)).length;
  const toggleCat   = (key) => setOpenCats(prev   => ({ ...prev, [key]: !prev[key] }));
  const toggleGrade = (key) => setOpenGrades(prev  => ({ ...prev, [key]: !prev[key] }));

  return (
    <div style={{ background:"#F8F7F4", minHeight:"100vh" }} className="p-4 md:p-6 max-w-screen-xl mx-auto">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div style={{ background:"#1B3A6B", borderRadius:10 }} className="w-9 h-9 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </div>
            <h1 style={{ color:"#1B3A6B" }} className="text-2xl font-black tracking-tight">Products Catalog</h1>
          </div>
          <div className="ml-12 flex flex-col gap-0.5">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{products.length}</span> products
              {lowStockCount > 0 && <> · <span style={{ color:"#E8630A" }} className="font-semibold">{lowStockCount} low stock</span></>}
            </p>
            {latestTally ? (
              <p className="text-xs flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full font-semibold">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Last Tallied: {formatDateTime(latestTally.tallied_at)}
                </span>
                <span className="text-gray-400">by {latestTally.tallied_by}</span>
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic">No tally recorded yet</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExportExcel} style={{ background:"#0D7A5F" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
          <button onClick={handleExportTally} style={{ background:"#7C3AED" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Tally XML
          </button>
          <button onClick={handleExportPDF} style={{ background:"#DC2626" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          <button onClick={() => setShowTallyAll(true)} style={{ background:"#5B21B6" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ✓ Tally All
          </button>
          <button onClick={() => setShowBulk(v => !v)} style={{ background: showBulk ? "#6B7280" : "#0369A1" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {showBulk ? "✕ Close" : "Bulk Upload"}
          </button>
          <button onClick={() => setShowAddForm(v => !v)} style={{ background: showAddForm ? "#6B7280" : "#E8630A" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            {showAddForm ? "✕ Cancel" : "+ Add Product"}
          </button>
        </div>
      </div>

      {/* ── BULK UPLOAD PANEL ── */}
      {showBulk && (
        <div className="bg-white border border-blue-200 shadow rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-base" style={{ color:"#0369A1" }}>📥 Bulk Upload Products</h3>
            <button onClick={downloadTemplate} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition">
              ⬇ Download Template
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Upload an Excel (.xlsx) or CSV file with columns:{" "}
            <code className="bg-gray-100 px-1 rounded">product_id</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">product_name</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">stock</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">low_alert</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">high_alert</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">location</code>.{" "}
            Existing products (matched by name) will be updated. Stock value will be added as an opening inward transaction.
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleBulkFile} className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold hover:file:bg-blue-100 mb-3" />
          {bulkErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              {bulkErrors.map((e,i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          {bulkRows.length > 0 && (
            <>
              <p className="text-xs text-gray-500 mb-2 font-semibold">{bulkRows.length} rows ready to import:</p>
              <div className="overflow-x-auto max-h-52 border border-gray-100 rounded-lg mb-3">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold">Product ID</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold">Product Name</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold">Stock</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold">Low Alert</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold">High Alert</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-bold">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-3 py-1.5 font-mono text-gray-600">{r.product_id || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-800 font-medium">{r.product_name}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r._stock ?? "—"}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.low_stock_alert ?? "—"}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.high_stock_alert ?? "—"}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r._location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={handleBulkSave} disabled={bulkSaving} style={{ background:"#0369A1" }} className="text-white px-5 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
                {bulkSaving ? "Importing…" : `Import ${bulkRows.length} Products`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── ADD PRODUCT FORM ── */}
      {showAddForm && (
        <div className="bg-white border border-orange-200 shadow rounded-xl p-5 mb-5">
          <h3 className="font-black text-base mb-3" style={{ color:"#E8630A" }}>+ Add New Product</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Product ID <span className="font-normal text-gray-400">(optional)</span></label>
              <input value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} placeholder="e.g. NM-PP-001" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Product Name <span className="text-red-400">*</span></label>
              <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="e.g. 25NB SS 304 Seamless Pipe" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Low Stock Alert</label>
              <input type="number" value={form.low_stock_alert} onChange={e => setForm(f => ({ ...f, low_stock_alert: e.target.value }))} placeholder="e.g. 10" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAddProduct} disabled={saving || !form.product_name.trim()} style={{ background:"#E8630A" }} className="text-white px-5 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
              {saving ? "Saving…" : "Save Product"}
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* ── SEARCH ── */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by product ID or name…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* ── CATEGORY FILTER PILLS ── */}
      {!loading && catOrder.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {catOrder.map(catKey => {
            const cat = CATEGORIES.find(c => c.key === catKey);
            const count = catCounts[catKey] || 0;
            const isActive = activeCat === catKey;
            return (
              <button
                key={catKey}
                onClick={() => setActiveCat(isActive ? null : catKey)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border"
                style={{
                  background: isActive ? cat.color : "white",
                  color: isActive ? "white" : cat.color,
                  borderColor: cat.color,
                  boxShadow: isActive ? `0 2px 8px ${cat.color}40` : "none",
                }}
              >
                <span style={{ fontSize: "0.7rem" }}>{cat.icon}</span>
                {cat.label} <span style={{ opacity: 0.8 }}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin mr-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading products…
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-3">📦</div>
          <p className="text-gray-500 font-semibold">No products found</p>
          <p className="text-gray-400 text-sm mt-1">{search ? "Try a different search term" : "Add your first product using the button above"}</p>
        </div>
      )}

      {/* ── CATEGORY GROUPS ── */}
      {!loading && visibleCatOrder.map(catKey => {
        const { cat, grades } = grouped[catKey];
        const allItems = Object.values(grades).flat();
        const catTotal = allItems.reduce((s,p) => s + totalStock(p.id), 0);
        const isOpen = openCats[catKey] !== false;
        return (
          <div key={catKey} className="mb-4 rounded-xl overflow-hidden shadow-sm border border-gray-200">
            {/* Category header */}
            <button
              onClick={() => toggleCat(catKey)}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition hover:opacity-90"
              style={{ background: cat.color }}
            >
              <div className="flex items-center gap-3">
                <span className="text-white text-xl">{cat.icon}</span>
                <div>
                  <span className="text-white font-black text-sm">{cat.label}</span>
                  <span className="text-white/70 text-xs ml-2">{allItems.length} products</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-sm">{catTotal.toLocaleString()} units</span>
                <svg className={`text-white transition-transform ${isOpen ? "rotate-180" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </button>

            {isOpen && Object.keys(grades).sort(gradeSort).map(grade => {
              const items = grades[grade];
              const gradeKey = `${catKey}__${grade}`;
              const isGradeOpen = openGrades[gradeKey] !== false;
              return (
                <div key={grade}>
                  {/* Grade sub-header */}
                  <button
                    onClick={() => toggleGrade(gradeKey)}
                    className="w-full flex items-center justify-between px-5 py-2 text-left transition hover:opacity-80"
                    style={{ background: cat.light }}
                  >
                    <span className="text-xs font-black tracking-wide" style={{ color: cat.color }}>{grade} · {items.length} items</span>
                    <svg className={`transition-transform`} style={{ color: cat.color }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points={isGradeOpen ? "6 9 12 15 18 9" : "6 15 12 9 18 15"}/></svg>
                  </button>

                  {isGradeOpen && (
                    <div className="bg-white overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 w-28">Product ID</th>
                            <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400">Product Name</th>
                            <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-20">Office</th>
                            <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-24">Warehouse</th>
                            <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-20">Total</th>
                            <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-20">Alert</th>
                            <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-44">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p, idx) => {
                            const total = totalStock(p.id);
                            const office = officeStock(p.id);
                            const warehouse = warehouseStock(p.id);
                            const isLow = p.low_stock_alert && total <= Number(p.low_stock_alert);
                            const isEditing = editingId === p.id;
                            return (
                              <tr key={p.id} className={`border-b border-gray-50 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30`}>
                                <td className="px-4 py-2.5">
                                  {isEditing
                                    ? <input value={editForm.product_id || ""} onChange={e => setEditForm(f => ({ ...f, product_id: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-mono" />
                                    : <span className="font-mono text-xs text-gray-500">{p.product_id || "—"}</span>
                                  }
                                </td>
                                <td className="px-4 py-2.5">
                                  {isEditing
                                    ? <input value={editForm.product_name} onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                                    : (
                                      <button onClick={() => openLedger(p)} className="text-left font-semibold text-gray-800 hover:underline hover:text-blue-700 transition">
                                        {p.product_name}
                                        {isLow && <span className="ml-2 text-xs font-bold text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">Low</span>}
                                      </button>
                                    )
                                  }
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="font-semibold text-gray-700">{office}</span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="font-semibold text-gray-700">{warehouse}</span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`font-black text-sm ${isLow ? "text-orange-500" : "text-gray-800"}`}>{total}</span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {isEditing
                                    ? <input type="number" value={editForm.low_stock_alert || ""} onChange={e => setEditForm(f => ({ ...f, low_stock_alert: e.target.value }))} className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center" />
                                    : <span className="text-xs text-gray-400">{p.low_stock_alert || "—"}</span>
                                  }
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {isEditing ? (
                                      <>
                                        <button onClick={() => saveEdit(p.id)} style={{ background:"#1B3A6B" }} className="text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-80 transition">Save</button>
                                        <button onClick={() => setEditingId(null)} className="text-gray-500 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:bg-gray-50 transition">Cancel</button>
                                      </>
                                    ) : (
                                      <>
                                        {/* +O Office */}
                                        <button
                                          onClick={() => setStockModal({ product: p, mode: "office" })}
                                          title="Add to Office"
                                          className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition text-xs font-bold whitespace-nowrap"
                                        >+O</button>
                                        {/* +W Warehouse */}
                                        <button
                                          onClick={() => setStockModal({ product: p, mode: "warehouse" })}
                                          title="Add to Warehouse"
                                          className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition text-xs font-bold whitespace-nowrap"
                                        >+W</button>
                                        {/* Edit */}
                                        <button
                                          onClick={() => startEdit(p)}
                                          title="Edit"
                                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        {/* Delete */}
                                        <button
                                          onClick={() => setDeleteConfirm(p.id)}
                                          title="Delete"
                                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition"
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                        </button>
                                      </>
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
        );
      })}

      {/* ── STOCK MODAL ── */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-black text-base mb-1" style={{ color:"#1B3A6B" }}>Add Stock</h3>
            <p className="text-xs text-gray-500 mb-4 truncate">{stockModal.product.product_name} → <span className="font-semibold capitalize">{stockModal.mode}</span></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Quantity <span className="text-red-400">*</span></label>
                <input type="number" value={stockForm.quantity} onChange={e => setStockForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Party / Supplier</label>
                <input value={stockForm.party} onChange={e => setStockForm(f => ({ ...f, party: e.target.value }))} placeholder="e.g. Rajesh Steel" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                <input value={stockForm.notes} onChange={e => setStockForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={submitStock} style={{ background:"#1B3A6B" }} className="flex-1 text-white py-2 rounded-lg text-sm font-bold hover:opacity-90 transition">Add Stock</button>
              <button onClick={() => { setStockModal(null); setStockForm({ quantity:"", notes:"", party:"" }); }} className="flex-1 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="font-black text-base text-gray-800 mb-2">Delete Product?</h3>
            <p className="text-sm text-gray-500 mb-5">This will permanently delete the product and all its transaction history. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition">Yes, Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TALLY ALL MODAL ── */}
      {showTallyAll && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="font-black text-base text-gray-800 mb-2">Confirm Tally All</h3>
            <p className="text-sm text-gray-500 mb-5">This will record a new tally event for all products with the current timestamp.</p>
            <div className="flex gap-3">
              <button onClick={handleTallyAll} disabled={tallyAllConfirming} style={{ background:"#5B21B6" }} className="flex-1 text-white py-2 rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
                {tallyAllConfirming ? "Recording…" : "Confirm Tally"}
              </button>
              <button onClick={() => setShowTallyAll(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEDGER MODAL ── */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-black text-base text-gray-800">{selectedProduct.product_name}</h2>
                <p className="text-xs text-gray-400 font-mono">{selectedProduct.product_id || "No ID"} · Total: <span className="font-bold text-gray-600">{totalStock(selectedProduct.id)}</span></p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {ledgerLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <svg className="animate-spin mr-2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Loading ledger…
                </div>
              ) : ledger.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-semibold">No transactions yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400">Date</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400">Type</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400">Qty</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400">Balance</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400">Party</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((t, i) => (
                      <tr key={t.id} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-4 py-2 text-xs text-gray-500">{formatDateTime(t.created_at)}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${t.transaction_type === "inward" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                            {t.transaction_type === "inward" ? "▲ IN" : "▼ OUT"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center font-semibold">{Number(t.quantity)}</td>
                        <td className="px-4 py-2 text-center font-black text-gray-800">{t.balance}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{t.party || "—"}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{t.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
