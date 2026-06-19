import { useEffect, useState, useCallback } from "react";
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
  { key: "seamless",  label: "Seamless Pipes",     icon: "⬤",  color: "#1B3A6B", light: "#EBF0FA", prefixes: ["NM-NBSMLS","NM-SMLS"] },
  { key: "polish",    label: "Polish Pipes (ERW)",  icon: "◉",  color: "#E8630A", light: "#FEF0E7", prefixes: ["NM-PP"] },
  { key: "nb",        label: "NB / GI Pipes",      icon: "◎",  color: "#0D7A5F", light: "#E6F5F1", prefixes: ["NM-NB"] },
  { key: "nonpolish", label: "Non-Polish Pipes",   icon: "○",  color: "#7C3AED", light: "#F3EFFE", prefixes: ["NM-NMPR","NM-NPS","NM-NPR"] },
  { key: "sheets",    label: "Sheets / Plates",    icon: "▭",  color: "#B45309", light: "#FEF3E2", prefixes: ["NM-SH","NM-SNO"] },
  { key: "other",     label: "Others",             icon: "◇",  color: "#374151", light: "#F3F4F6", prefixes: [] },
];

function getCategory(product_id, product_name) {
  const pid   = (product_id   || "").toUpperCase();
  const pname = (product_name || "").toUpperCase();
  for (const cat of CATEGORIES) {
    if (cat.key === "other") continue;
    if (cat.prefixes.some(p => pid.startsWith(p))) return cat;
    if (cat.key === "sheets" && (pname.includes("SHEET") || pname.includes("PLATE"))) return cat;
  }
  return CATEGORIES[CATEGORIES.length - 1];
}

// ── Grade extraction — order matters (most specific first) ──────────────────
const GRADE_PATTERNS = [
  // Steel grades
  { re: /\b316[Ll]?\b/i,          label: "Grade 316"  },
  { re: /\b304[Ll]?\b/i,          label: "Grade 304"  },
  { re: /\b202\b/i,               label: "Grade 202"  },
  { re: /\b201\b/i,               label: "Grade 201"  },
  { re: /\b310[Ss]?\b/i,          label: "Grade 310"  },
  { re: /\b321\b/i,               label: "Grade 321"  },
  // Schedules
  { re: /SCH[-\s]?80/i,           label: "SCH-80"     },
  { re: /SCH[-\s]?40/i,           label: "SCH-40"     },
  { re: /SCH[-\s]?20/i,           label: "SCH-20"     },
  { re: /SCH[-\s]?10/i,           label: "SCH-10"     },
  // SWG — from thickest gauge (smallest number) to thinnest
  { re: /\b10[\s-]?SWG\b/i,       label: "10 SWG"    },
  { re: /\b12[\s-]?SWG\b/i,       label: "12 SWG"    },
  { re: /\b14[\s-]?SWG\b/i,       label: "14 SWG"    },
  { re: /\b16[\s-]?SWG\b/i,       label: "16 SWG"    },
  { re: /\b18[\s-]?SWG\b/i,       label: "18 SWG"    },
  { re: /\b20[\s-]?SWG\b/i,       label: "20 SWG"    },
  { re: /\b22[\s-]?SWG\b/i,       label: "22 SWG"    },
  { re: /\bSWG\b/i,               label: "SWG"        },
  // Thickness / weight grades
  { re: /\bHEAVY\b/i,             label: "Heavy"      },
  { re: /\bMEDIUM\b/i,            label: "Medium"     },
  { re: /\bLIGHT\b/i,             label: "Light"      },
  // Standards
  { re: /\bA106\b/i,              label: "A106"       },
  { re: /\bA53\b/i,               label: "A53"        },
  { re: /\bIS[-\s]?2062\b/i,      label: "IS2062"     },
  { re: /\bIS[-\s]?1239\b/i,      label: "IS1239"     },
  { re: /\bIS[-\s]?3589\b/i,      label: "IS3589"     },
];

// Grade sort order for display
const GRADE_ORDER = [
  "Grade 201","Grade 202","Grade 304","Grade 316","Grade 310","Grade 321",
  "SCH-10","SCH-20","SCH-40","SCH-80",
  "10 SWG","12 SWG","14 SWG","16 SWG","18 SWG","20 SWG","22 SWG","SWG",
  "Heavy","Medium","Light",
  "A106","A53","IS2062","IS1239","IS3589",
  "Standard",
];

function gradeSort(a, b) {
  const ai = GRADE_ORDER.indexOf(a);
  const bi = GRADE_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

function extractGrade(name) {
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

export default function Products() {
  const [products, setProducts]     = useState([]);
  const [stockMap, setStockMap]     = useState({});
  const [locations, setLocations]   = useState([]);
  const [search, setSearch]         = useState("");
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

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try { await Promise.all([loadProducts(), loadLocations(), loadStockFromTransactions()]); }
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

  // ── Export: Excel ────────────────────────────────────────────────────────────
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
          });
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, `Nivee_Products_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Export: Tally XML ────────────────────────────────────────────────────────
  const handleExportTally = () => {
    if (!products.length) return;
    const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const stockItems = products.map(p => {
      const total = totalStock(p.id);
      return `
    <STOCKITEM NAME="${esc(p.product_name)}" RESERVEDNAME="">
      <PARENT></PARENT>
      <CATEGORY></CATEGORY>
      <BASEUNITS>NOS</BASEUNITS>
      <OPENINGBALANCE>${total}</OPENINGBALANCE>
      <OPENINGRATE>0</OPENINGRATE>
      <OPENINGVALUE>0</OPENINGVALUE>
      <BATCHALLOCATIONS.LIST></BATCHALLOCATIONS.LIST>
    </STOCKITEM>`;
    }).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Stock Items</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Nivee Metal</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">${stockItems}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    const blob = new Blob([xml], { type: "text/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Nivee_Tally_${new Date().toISOString().slice(0,10)}.xml`;
    a.click();
  };

  // ── Export: PDF ──────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    if (!products.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(27, 58, 107);
    doc.rect(0, 0, pageW, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("NIVEE METAL — Products Catalog", 14, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}`, pageW - 14, 12, { align: "right" });

    let y = 24;

    catOrder.forEach(catKey => {
      const { cat, grades } = grouped[catKey];
      const allItems = Object.values(grades).flat();
      const catTotal = allItems.reduce((s,p) => s + totalStock(p.id), 0);

      // Category header band
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
        const rows = items.map(p => [
          p.product_id || "—",
          p.product_name,
          officeStock(p.id),
          warehouseStock(p.id),
          totalStock(p.id),
          p.low_stock_alert || "—",
        ]);

        doc.autoTable({
          startY: y,
          head: [[
            { content: `Grade: ${grade}`, colSpan: 6, styles: { fillColor: hexToRgbArr(cat.color, 0.15), textColor: hexToRgbArr(cat.color), fontStyle: "bold", fontSize: 8 } }
          ], [
            "Product ID", "Name", "Office", "Warehouse", "Total", "Alert"
          ]],
          body: rows,
          theme: "grid",
          styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
          headStyles: { fillColor: hexToRgbArr(cat.color), textColor: [255,255,255], fontStyle: "bold", fontSize: 7.5 },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          columnStyles: {
            0: { cellWidth: 28, font: "courier" },
            1: { cellWidth: "auto" },
            2: { cellWidth: 20, halign: "center" },
            3: { cellWidth: 24, halign: "center" },
            4: { cellWidth: 18, halign: "center", fontStyle: "bold" },
            5: { cellWidth: 18, halign: "center" },
          },
          margin: { left: 10, right: 10 },
          didDrawPage: (data) => {
            // footer page number
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

  // ── Helpers for PDF color ────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return { r, g, b };
  }
  function hexToRgbArr(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    if (alpha !== undefined) {
      return [Math.round(255 - (255-r)*alpha), Math.round(255-(255-g)*alpha), Math.round(255-(255-b)*alpha)];
    }
    return [r, g, b];
  }

  const filtered = products
    .filter(p => (p.product_name||"").toLowerCase().includes(search.toLowerCase()) || (p.product_id||"").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => (a.product_name||"").localeCompare(b.product_name||""));

  const grouped = {};
  filtered.forEach(p => {
    const cat   = getCategory(p.product_id, p.product_name);
    const grade = extractGrade(p.product_name);
    if (!grouped[cat.key]) grouped[cat.key] = { cat, grades: {} };
    if (!grouped[cat.key].grades[grade]) grouped[cat.key].grades[grade] = [];
    grouped[cat.key].grades[grade].push(p);
  });
  Object.values(grouped).forEach(({ grades }) => {
    Object.keys(grades).forEach(g => { grades[g].sort((a,b) => extractSizeKey(a.product_name) - extractSizeKey(b.product_name)); });
  });

  const catOrder = CATEGORIES.map(c => c.key).filter(k => grouped[k]);
  const lowStockCount = products.filter(p => p.low_stock_alert && totalStock(p.id) <= Number(p.low_stock_alert)).length;
  const toggleCat   = (key) => setOpenCats(prev   => ({ ...prev, [key]: !prev[key]  }));
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
          <p className="text-sm text-gray-500 ml-12">
            <span className="font-semibold text-gray-700">{products.length}</span> products
            {lowStockCount > 0 && <> · <span style={{ color:"#E8630A" }} className="font-semibold">{lowStockCount} low stock</span></>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Excel */}
          <button onClick={handleExportExcel} style={{ background:"#0D7A5F" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
          {/* Tally */}
          <button onClick={handleExportTally} style={{ background:"#7C3AED" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Tally
          </button>
          {/* PDF */}
          <button onClick={handleExportPDF} style={{ background:"#DC2626" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h1a2 2 0 0 1 0 4H9v-4zm4 0h2m-2 2h1.5m-.5 2h1"/></svg>
            PDF
          </button>
          {/* Add */}
          <button onClick={() => setShowAddForm(v => !v)} style={{ background: showAddForm ? "#6B7280" : "#E8630A" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            {showAddForm ? "✕ Cancel" : "+ Add Product"}
          </button>
        </div>
      </div>

      {/* ADD FORM */}
      {showAddForm && (
        <div className="bg-white border-l-4 shadow rounded-xl p-5 mb-5 grid grid-cols-1 sm:grid-cols-4 gap-3" style={{ borderColor:"#E8630A" }}>
          <input placeholder="Product ID (optional)" value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}
            className="border border-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none" />
          <input placeholder="Product Name *" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })}
            className="border border-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none sm:col-span-2" />
          <input placeholder="Low Stock Alert" value={form.low_stock_alert} type="number" onChange={e => setForm({ ...form, low_stock_alert: e.target.value })}
            className="border border-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none" />
          <button onClick={handleAddProduct} disabled={saving || !form.product_name.trim()}
            style={{ background:"#1B3A6B" }} className="sm:col-span-4 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-bold transition hover:opacity-90">
            {saving ? "Adding…" : "Add Product"}
          </button>
        </div>
      )}

      {/* SEARCH */}
      <div className="relative mb-5">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input placeholder="Search by product ID or name…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none bg-white shadow-sm" />
      </div>

      {/* CATEGORY PILLS */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.filter(c => grouped[c.key]).map(c => (
          <button key={c.key} onClick={() => toggleCat(c.key)}
            style={{ background: openCats[c.key] === false ? c.light : c.color, color: openCats[c.key] === false ? c.color : "#fff", border:`1.5px solid ${c.color}` }}
            className="px-3 py-1 rounded-full text-xs font-bold transition-all">
            {c.icon} {c.label} ({Object.values(grouped[c.key]?.grades||{}).flat().length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin mr-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading products…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="mx-auto mb-3 opacity-40" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <p className="font-semibold">No products found</p>
          <p className="text-sm mt-1">Try a different search term</p>
        </div>
      ) : (
        <div className="space-y-4">
          {catOrder.map(catKey => {
            const { cat, grades } = grouped[catKey];
            const totalProducts   = Object.values(grades).flat().length;
            const totalQty        = Object.values(grades).flat().reduce((s,p) => s + totalStock(p.id), 0);
            const isOpen          = openCats[catKey] !== false;

            return (
              <div key={catKey} className="rounded-2xl overflow-hidden shadow-sm" style={{ border:`1.5px solid ${cat.color}22` }}>
                <button onClick={() => toggleCat(catKey)} className="w-full flex items-center justify-between px-5 py-4 transition-colors text-left" style={{ background: cat.light }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm" style={{ background: cat.color }}>
                      {cat.icon}
                    </div>
                    <div>
                      <p className="font-black text-base" style={{ color: cat.color }}>{cat.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{totalProducts} products · {totalQty.toLocaleString()} units total · {Object.keys(grades).length} grade{Object.keys(grades).length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <svg className="transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: cat.color }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                </button>

                {isOpen && (
                  <div className="bg-white">
                    {Object.keys(grades).sort(gradeSort).map(grade => {
                      const gradeKey   = `${catKey}-${grade}`;
                      const isGradeOpen = openGrades[gradeKey] !== false;
                      const items      = grades[grade];
                      const gradeQty   = items.reduce((s,p) => s + totalStock(p.id), 0);

                      return (
                        <div key={grade} className="border-t border-gray-50">
                          <button onClick={() => toggleGrade(gradeKey)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition text-left" style={{ background:"#FAFAF9" }}>
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold text-white" style={{ background: cat.color }}>{grade}</span>
                              <span className="text-sm font-semibold text-gray-600">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                              <span className="text-xs text-gray-400">· {gradeQty.toLocaleString()} units</span>
                            </div>
                            <svg className="transition-transform text-gray-400" style={{ transform: isGradeOpen ? "rotate(180deg)" : "rotate(0deg)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                          </button>

                          {isGradeOpen && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr style={{ background: cat.light }} className="text-xs font-bold uppercase tracking-wide">
                                    <th className="px-4 py-2.5 text-left" style={{ color: cat.color }}>Product ID</th>
                                    <th className="px-4 py-2.5 text-left" style={{ color: cat.color }}>Name</th>
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Office</th>
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Warehouse</th>
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Total</th>
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Alert</th>
                                    <th className="px-4 py-2.5 text-center" style={{ color: cat.color }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {items.map(p => {
                                    const office    = officeStock(p.id);
                                    const warehouse = warehouseStock(p.id);
                                    const total     = totalStock(p.id);
                                    const isLow     = p.low_stock_alert && total <= Number(p.low_stock_alert);
                                    const isEditing = editingId === p.id;
                                    return (
                                      <tr key={p.id} className={`transition hover:bg-orange-50/20 ${isLow ? "bg-red-50/40" : ""}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                                          {isEditing
                                            ? <input value={editForm.product_id} onChange={e => setEditForm({ ...editForm, product_id: e.target.value })} className="border rounded px-2 py-1 w-full text-xs" />
                                            : (p.product_id || "—")}
                                        </td>
                                        <td className="px-4 py-3 font-semibold cursor-pointer" onClick={() => !isEditing && openLedger(p)}>
                                          {isEditing
                                            ? <input value={editForm.product_name} onChange={e => setEditForm({ ...editForm, product_name: e.target.value })} className="border rounded px-2 py-1 w-full" />
                                            : <span className="hover:underline" style={{ color:"#1B3A6B" }}>{p.product_name}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums" style={{ background:"#EBF0FA", color:"#1B3A6B" }}>{office}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums" style={{ background:"#E6F5F1", color:"#0D7A5F" }}>{warehouse}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="font-black tabular-nums text-gray-800">{total}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          {isEditing
                                            ? <input value={editForm.low_stock_alert} type="number" onChange={e => setEditForm({ ...editForm, low_stock_alert: e.target.value })} className="border rounded px-2 py-1 w-16 text-center text-xs" />
                                            : <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isLow ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>{p.low_stock_alert || "—"}</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                            {isEditing ? (
                                              <>
                                                <button onClick={() => saveEdit(p.id)} className="text-xs text-white px-2.5 py-1 rounded-md" style={{ background:"#0D7A5F" }}>Save</button>
                                                <button onClick={() => setEditingId(null)} className="text-xs bg-gray-200 text-gray-700 px-2.5 py-1 rounded-md">Cancel</button>
                                              </>
                                            ) : (
                                              <>
                                                <div className="relative group">
                                                  <button className="text-xs px-2.5 py-1 rounded-md font-medium" style={{ background:"#EBF0FA", color:"#1B3A6B" }}>+ Stock ▾</button>
                                                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-10 hidden group-hover:block min-w-[140px] overflow-hidden">
                                                    {["office","warehouse","both"].map(mode => (
                                                      <button key={mode} onClick={e => { e.stopPropagation(); setStockModal({ product: p, mode }); }}
                                                        className="block w-full text-left px-4 py-2.5 text-xs hover:bg-orange-50 capitalize font-medium text-gray-700">
                                                        {mode === "both" ? "Office + Warehouse" : mode.charAt(0).toUpperCase()+mode.slice(1)}
                                                      </button>
                                                    ))}
                                                  </div>
                                                </div>
                                                <button onClick={e => { e.stopPropagation(); startEdit(p); }} className="text-xs px-2.5 py-1 rounded-md font-medium bg-amber-50 text-amber-700 hover:bg-amber-100">Edit</button>
                                                <button onClick={e => { e.stopPropagation(); setDeleteConfirm(p); }} className="text-xs px-2.5 py-1 rounded-md font-medium bg-red-50 text-red-600 hover:bg-red-100">Delete</button>
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* LEDGER MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setSelectedProduct(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between text-white" style={{ background:"#1B3A6B" }}>
              <div>
                <p className="font-black text-lg">{selectedProduct.product_name}</p>
                <p className="text-blue-200 text-xs font-mono mt-0.5">{selectedProduct.product_id}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-blue-200 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="flex gap-6 px-6 py-3 border-b" style={{ background:"#EBF0FA" }}>
              <div><p className="text-xs text-gray-500 font-semibold">OFFICE</p><p className="font-black text-xl" style={{ color:"#1B3A6B" }}>{officeStock(selectedProduct.id)}</p></div>
              <div className="border-l border-blue-200" />
              <div><p className="text-xs text-gray-500 font-semibold">WAREHOUSE</p><p className="font-black text-xl" style={{ color:"#0D7A5F" }}>{warehouseStock(selectedProduct.id)}</p></div>
              <div className="border-l border-blue-200" />
              <div><p className="text-xs text-gray-500 font-semibold">TOTAL</p><p className="font-black text-xl text-gray-800">{totalStock(selectedProduct.id)}</p></div>
            </div>
            <div className="overflow-y-auto flex-1">
              {ledgerLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading ledger…</div>
              ) : ledger.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">No transactions yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b text-xs uppercase text-gray-500 font-bold tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3 text-left">Party</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...ledger].reverse().map((t, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${t.transaction_type==="inward" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {t.transaction_type === "inward" ? "▲ In" : "▼ Out"}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${t.transaction_type==="inward" ? "text-green-600" : "text-red-500"}`}>
                          {t.transaction_type==="inward" ? "+" : "-"}{Number(t.quantity)}
                        </td>
                        <td className="px-4 py-3 text-right font-black tabular-nums text-gray-800">{t.balance}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{t.party || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{t.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD STOCK MODAL */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setStockModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-lg mb-1" style={{ color:"#1B3A6B" }}>Add Stock</h3>
            <p className="text-sm text-gray-500 mb-4">{stockModal.product.product_name} · <span className="capitalize font-semibold">{stockModal.mode === "both" ? "Office + Warehouse" : stockModal.mode}</span></p>
            <div className="space-y-3">
              <input type="number" placeholder="Quantity *" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                className="w-full border border-gray-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none" />
              <input placeholder="Party name (optional)" value={stockForm.party} onChange={e => setStockForm({ ...stockForm, party: e.target.value })}
                className="w-full border border-gray-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none" />
              <textarea placeholder="Notes (optional)" value={stockForm.notes} onChange={e => setStockForm({ ...stockForm, notes: e.target.value })} rows={2}
                className="w-full border border-gray-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none resize-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStockModal(null)} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={submitStock} disabled={!stockForm.quantity} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background:"#E8630A" }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-lg text-red-600 mb-2">Delete Product?</h3>
            <p className="text-sm text-gray-600 mb-5">This will permanently delete <span className="font-semibold">{deleteConfirm.product_name}</span>. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 bg-red-600 hover:bg-red-700 py-2.5 rounded-xl text-sm font-bold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
