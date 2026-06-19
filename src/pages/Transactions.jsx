import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ─────────────────────────────────────────
   NIVEE BRAND COLORS (mirrors Products.jsx)
   Primary: Deep Steel Blue  #1B3A6B
   Accent:  Nivee Orange     #E8630A
   Surface: Warm White       #F8F7F4
───────────────────────────────────────── */

const ADMIN_EMAILS = [
  "niveemetals@gmail.com",
  "vishalom999@gmail.com",
  "vikrambhandari7171@gmail.com",
];

// ── Catalog ordering helpers ──────────────────────────────────────────────────

function inferMaterial(productName) {
  const n = productName.toUpperCase();
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

function inferCategory(productName) {
  const n = productName.toUpperCase();
  if (n.includes("SEAMLESS")) return "Seamless";
  if (n.includes("SCH 160") || n.includes("SCH-160") || n.includes("SCH160")) return "SCH 160";
  if (n.includes("SCH 80")  || n.includes("SCH-80")  || n.includes("SCH80"))  return "SCH 80";
  if (n.includes("SCH 40")  || n.includes("SCH-40")  || n.includes("SCH40"))  return "SCH 40";
  if (n.includes("SCH 20")  || n.includes("SCH-20")  || n.includes("SCH20"))  return "SCH 20";
  if (n.includes("SCH 10")  || n.includes("SCH-10")  || n.includes("SCH10"))  return "SCH 10";
  if (n.includes("SCH 5")   || n.includes("SCH-5")   || n.includes("SCH05") || n.includes("SCH-05")) return "SCH 5";
  const swgMatch = n.match(/(\d+)\s*SWG/);
  if (swgMatch) return `SWG ${swgMatch[1]}`;
  if (n.includes("POLISH") || n.includes("POLISHED")) return "Polish Pipe";
  if (n.includes("SQUARE")) return "Square Rod";
  if (n.includes("RECTANGLE") || n.includes("RECTANGULAR") || n.includes("RECTANGE")) return "Rectangular Pipe";
  if (n.includes("ROUND BAR") || n.includes("ROUND ROD") || n.includes("BRIGHT ROD") || n.includes("BRIGHT BAR")) return "Round Bar";
  if (n.includes("FLAT BAR") || n.includes("FLAT ROD")) return "Flat Bar";
  if (n.includes("ANGLE")) return "Angle";
  if (n.includes("CHANNEL")) return "Channel";
  if (
    n.includes("SHEET") || n.includes("PLATE") ||
    n.includes(" MAT ") || n.endsWith(" MAT") ||
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
    const slashIdx = raw.indexOf("/");
    const denomStr = raw.slice(slashIdx + 1);
    const numerStr = raw.slice(slashIdx - 1, slashIdx);
    const wholeStr = raw.slice(0, slashIdx - 1);
    const whole = wholeStr ? parseInt(wholeStr, 10) : 0;
    const numer = parseInt(numerStr, 10);
    const denom = parseInt(denomStr, 10);
    if (!isNaN(whole) && !isNaN(numer) && !isNaN(denom) && denom !== 0)
      return whole + numer / denom;
  }
  const plain = parseFloat(raw);
  return isNaN(plain) ? 0 : plain;
}

function extractSizeKey(productName) {
  const n = productName.trim();
  const inchMatch = n.match(/(\d+(?:\/\d+)?)\s*"/i);
  if (inchMatch) return parseInchFraction(inchMatch[1]);
  const nbMatch = n.match(/(\d+(?:\.\d+)?)\s*NB/i);
  if (nbMatch) return parseFloat(nbMatch[1]);
  const mmMatch = n.match(/(\d+(?:\.\d+)?)\s*(?:X\s|MM)/i);
  if (mmMatch) return parseFloat(mmMatch[1]);
  const anyNum = n.match(/(\d+(?:\.\d+)?)/);
  if (anyNum) return parseFloat(anyNum[1]);
  return 0;
}

const CATEGORY_ORDER = [
  "SCH 5","SCH 10","SCH 20","SCH 40","SCH 80","SCH 160",
  "Seamless","SWG 20","SWG 18","SWG 16","SWG 14","SWG 12","SWG 10",
  "ERW","Polish Pipe","Square Rod","Rectangular Pipe",
  "Round Bar","Flat Bar","Angle","Channel",
  "Sheet / Plate","Coil / Strip","Pipe (General)","General",
];

const MATERIAL_ORDER = [
  "SS 304","SS 304L","SS 316","SS 316L","SS 202","SS 201",
  "SS 310","SS 321","SS 409","SS 430","MS","GI","Carbon Steel","Other",
];

function buildOrderedProductList(products) {
  const map = {};
  products.forEach(p => {
    const mat = inferMaterial(p.product_name);
    const cat = inferCategory(p.product_name);
    if (!map[mat]) map[mat] = {};
    if (!map[mat][cat]) map[mat][cat] = [];
    map[mat][cat].push(p);
  });
  const materialKeys = Object.keys(map).sort((a, b) => {
    const ia = MATERIAL_ORDER.indexOf(a), ib = MATERIAL_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1; if (ib === -1) return -1;
    return ia - ib;
  });
  const ordered = [];
  materialKeys.forEach(mat => {
    const catKeys = Object.keys(map[mat]).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1; if (ib === -1) return -1;
      return ia - ib;
    });
    catKeys.forEach(cat => {
      [...map[mat][cat]]
        .sort((a, b) => {
          const sA = extractSizeKey(a.product_name), sB = extractSizeKey(b.product_name);
          if (sA !== sB) return sA - sB;
          return a.product_id.localeCompare(b.product_id);
        })
        .forEach(p => ordered.push({ ...p, _material: mat, _category: cat }));
    });
  });
  return ordered;
}

// ── Big Prominent Product Picker ──────────────────────────────────────────────

function ProductPicker({ products, value, onChange }) {
  const [query, setQuery]           = useState("");
  const [open, setOpen]             = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef   = useRef(null);
  const listRef    = useRef(null);
  const wrapperRef = useRef(null);

  const orderedList     = buildOrderedProductList(products);
  const selectedProduct = products.find(p => p.id === value);

  const filtered = query.trim() === ""
    ? orderedList
    : orderedList.filter(p =>
        p.product_name.toLowerCase().includes(query.toLowerCase()) ||
        (p.product_id || "").toLowerCase().includes(query.toLowerCase())
      );

  useEffect(() => {
    const handler = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false); setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.querySelector(`[data-idx="${highlighted}"]`);
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted, open]);

  const selectProduct = p => { onChange(p.id); setQuery(""); setOpen(false); };

  const handleKeyDown = e => {
    if (!open) { setOpen(true); return; }
    if (e.key === "ArrowDown")  { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter")   { e.preventDefault(); if (filtered[highlighted]) selectProduct(filtered[highlighted]); }
    else if (e.key === "Escape")  { setOpen(false); setQuery(""); }
  };

  const handleClear = e => { e.stopPropagation(); onChange(""); setQuery(""); inputRef.current?.focus(); };

  let lastMat = null, lastCat = null;

  return (
    <div ref={wrapperRef} className="relative col-span-full">
      <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: "#1B3A6B" }}>
        🔍 Search &amp; Select Product
      </label>
      <div
        className="flex items-center rounded-xl bg-white cursor-text transition-all shadow-sm"
        style={{
          minHeight: "56px",
          border: open
            ? "2px solid #E8630A"
            : value
            ? "2px solid #1B3A6B"
            : "2px solid #D1D5DB",
          boxShadow: open ? "0 0 0 3px #E8630A22" : undefined,
        }}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {!open && selectedProduct && query === "" ? (
          <div className="flex items-center flex-1 px-4 gap-3">
            <span className="inline-flex items-center gap-1.5 text-white text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: "#1B3A6B" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4" />
              </svg>
              {selectedProduct.product_name}
            </span>
            <span className="text-xs text-gray-400">Click to change</span>
          </div>
        ) : (
          <div className="flex items-center flex-1 px-4 gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#E8630A" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlighted(0); setOpen(true); }}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              placeholder={selectedProduct ? selectedProduct.product_name : "Type product name or size (e.g. SS 304, 1\" SCH 40)…"}
              className="flex-1 py-3 text-base outline-none bg-transparent font-medium text-gray-800 placeholder-gray-400"
            />
          </div>
        )}
        {value && (
          <button type="button" onClick={handleClear} className="px-3 text-gray-400 hover:text-red-500 transition-colors text-xl leading-none flex-shrink-0" title="Clear">×</button>
        )}
        <span className="pr-4 text-sm pointer-events-none flex-shrink-0" style={{ color: "#1B3A6B" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div ref={listRef} className="absolute z-50 mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-2xl overflow-y-auto" style={{ maxHeight: "320px" }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-400 text-center">
              <div className="text-2xl mb-2">🔍</div>
              No products found for "{query}"
            </div>
          ) : (
            filtered.map((p, idx) => {
              const showMat = p._material !== lastMat;
              const showCat = showMat || p._category !== lastCat;
              lastMat = p._material; lastCat = p._category;
              return (
                <div key={p.id}>
                  {showMat && (
                    <div className="px-4 pt-2 pb-1 text-xs font-black text-white uppercase tracking-wider sticky top-0 z-10" style={{ background: "#1B3A6B" }}>
                      {p._material}
                    </div>
                  )}
                  {showCat && (
                    <div className="px-5 py-0.5 text-xs font-semibold border-b" style={{ color: "#E8630A", background: "#FEF0E7", borderColor: "#FDDAB8" }}>
                      {p._category}
                    </div>
                  )}
                  <div
                    data-idx={idx}
                    onClick={() => selectProduct(p)}
                    className="px-6 py-2.5 text-sm cursor-pointer transition-colors"
                    style={{
                      background: idx === highlighted ? "#EBF0FA" : p.id === value ? "#EBF0FA" : undefined,
                      color: idx === highlighted || p.id === value ? "#1B3A6B" : "#374151",
                      fontWeight: idx === highlighted || p.id === value ? 700 : 500,
                    }}
                  >
                    {p.product_name}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatIST(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function formatDateLabel(iso) {
  if (!iso) return "Unknown Date";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function isoToLocalDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Transactions() {
  const [products, setProducts]         = useState([]);
  const [locations, setLocations]       = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch]             = useState("");
  const [filterType, setFilterType]     = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo]     = useState("");
  const [loading, setLoading]           = useState(true);
  const [editingId, setEditingId]       = useState(null);
  const [isAdmin, setIsAdmin]           = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Collapsible date groups — mirrors Products collapsible categories
  const [openDates, setOpenDates]       = useState({});

  const [page, setPage]             = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  const [form, setForm] = useState({
    product_id: "", location_id: "", transaction_type: "inward",
    quantity: "", party: "", notes: "",
  });

  useEffect(() => { checkUserRole(); fetchDropdowns(); }, []);
  useEffect(() => { fetchTransactions(); }, [page]);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (ADMIN_EMAILS.includes(user?.email)) setIsAdmin(true);
  };

  async function fetchDropdowns() {
    const { data: prod } = await supabase.from("products").select("*");
    const { data: loc }  = await supabase.from("locations").select("*");
    setProducts(prod || []);
    setLocations(loc || []);
  }

  async function fetchTransactions() {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE, to = from + PAGE_SIZE - 1;
      const { data: trans, count, error } = await supabase
        .from("transactions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      setTransactions(trans || []);
      if (count !== null) setTotalCount(count);
    } catch (err) {
      console.error("Failed fetching transactions", err);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    if (!form.product_id || !form.location_id || !form.quantity) {
      alert("Please fill required fields: Product, Location, Quantity"); return;
    }
    try {
      const activeEmployee = localStorage.getItem("userEmail") || "Unknown User";
      const payload = {
        product_id:       form.product_id,
        location_id:      form.location_id,
        transaction_type: form.transaction_type,
        quantity:         Number(form.quantity),
        party:            form.party,
        notes:            form.notes || null,
        created_by_email: activeEmployee,
      };
      if (editingId) await supabase.from("transactions").update(payload).eq("id", editingId);
      else           await supabase.from("transactions").insert([payload]);
      setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "", notes: "" });
      setEditingId(null); setShowForm(false); setPage(0);
      fetchTransactions();
    } catch { alert("Failed to save transaction."); }
  };

  const handleEditClick = t => {
    setForm({
      product_id:       t.product_id,
      location_id:      t.location_id,
      transaction_type: t.transaction_type,
      quantity:         t.quantity,
      party:            t.party || "",
      notes:            t.notes || "",
    });
    setEditingId(t.id); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "", notes: "" });
    setEditingId(null); setShowForm(false);
  };

  const handleDelete = async id => {
    await supabase.from("transactions").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchTransactions();
  };

  const exportToExcel = async () => {
    try {
      const { data: allTrans } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
      const exportData = (allTrans || []).map(t => ({
        Date_IST:  formatIST(t.created_at),
        Product:   products.find(p => p.id === t.product_id)?.product_name || "",
        Type:      t.transaction_type.toUpperCase(),
        Quantity:  t.quantity,
        Location:  locations.find(l => l.id === t.location_id)?.name || "",
        Party:     t.party || "—",
        Notes:     t.notes || "—",
        Employee:  t.created_by_email || "System",
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      XLSX.writeFile(wb, `Nivee_Transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { alert("Export failed."); }
  };

  const exportToPDF = async () => {
    try {
      const { data: allTrans, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFillColor(27, 58, 107);
      doc.rect(0, 0, pageW, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text("NIVEE METAL — Transactions Report", 14, 12);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, pageW - 14, 12, { align: "right" });
      const head = [["Date (IST)", "Product", "Type", "Qty", "Location", "Party", "Notes", "Employee"]];
      const body = (allTrans || []).map(t => [
        formatIST(t.created_at),
        products.find(p => p.id === t.product_id)?.product_name || "—",
        t.transaction_type.toUpperCase(),
        String(t.quantity),
        locations.find(l => l.id === t.location_id)?.name || "—",
        t.party || "—",
        t.notes || "—",
        t.created_by_email || "System",
      ]);
      autoTable(doc, {
        head, body, startY: 23, theme: "grid",
        styles: { fontSize: 7, cellPadding: 2, overflow: "ellipsize", halign: "left", lineColor: [220, 220, 220], lineWidth: 0.2 },
        headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [235, 240, 250] },
        columnStyles: {
          0: { cellWidth: 34 }, 1: { cellWidth: 62 }, 2: { cellWidth: 16, halign: "center" },
          3: { cellWidth: 12, halign: "center" }, 4: { cellWidth: 20 }, 5: { cellWidth: 36 },
          6: { cellWidth: 36 }, 7: { cellWidth: 36 },
        },
        margin: { top: 23, left: 14, right: 14 },
        didDrawPage: () => {
          doc.setFontSize(7); doc.setTextColor(150);
          doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
        },
      });
      doc.save(`Nivee_Transactions_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) { alert("PDF export failed: " + err.message); }
  };

  // ── Filter + Group by date ────────────────────────────────────────────────
  const filtered = transactions.filter(t => {
    const product      = products.find(p => p.id === t.product_id);
    const matchSearch  = !search || product?.product_name?.toLowerCase().includes(search.toLowerCase()) || (t.party || "").toLowerCase().includes(search.toLowerCase());
    const matchType    = filterType === "all" || t.transaction_type === filterType;
    const matchLoc     = filterLocation === "all" || t.location_id === filterLocation;
    const localDate    = isoToLocalDate(t.created_at);
    const matchFrom    = !filterDateFrom || localDate >= filterDateFrom;
    const matchTo      = !filterDateTo   || localDate <= filterDateTo;
    return matchSearch && matchType && matchLoc && matchFrom && matchTo;
  });

  // Group by local date label (matches Products' category grouping pattern)
  const groupedByDate = {};
  filtered.forEach(t => {
    const label = isoToLocalDate(t.created_at); // YYYY-MM-DD key
    if (!groupedByDate[label]) groupedByDate[label] = [];
    groupedByDate[label].push(t);
  });
  const dateKeys = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a)); // newest first

  const toggleDate = (key) => setOpenDates(prev => ({ ...prev, [key]: !prev[key] }));

  const totalPages    = Math.ceil(totalCount / PAGE_SIZE);
  const inwardCount   = transactions.filter(t => t.transaction_type === "inward").length;
  const outwardCount  = transactions.filter(t => t.transaction_type === "outward").length;
  const inwardQty     = transactions.filter(t => t.transaction_type === "inward").reduce((s, t) => s + (Number(t.quantity) || 0), 0);
  const outwardQty    = transactions.filter(t => t.transaction_type === "outward").reduce((s, t) => s + (Number(t.quantity) || 0), 0);

  return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh" }} className="p-4 md:p-6 max-w-screen-xl mx-auto">

      {/* ── HEADER — mirrors Products header exactly ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div style={{ background: "#1B3A6B", borderRadius: 10 }} className="w-9 h-9 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </div>
            <h1 style={{ color: "#1B3A6B" }} className="text-2xl font-black tracking-tight">Transactions Log</h1>
          </div>
          {/* Stats strip — mirrors Products "X products · Y low stock" */}
          <div className="ml-12 flex flex-col gap-0.5">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{totalCount.toLocaleString()}</span> total entries
              {" · "}
              <span style={{ color: "#0D7A5F" }} className="font-semibold">{inwardCount} IN</span>
              {" · "}
              <span className="font-semibold text-red-500">{outwardCount} OUT</span>
              <span className="text-gray-400 text-xs ml-1">(this page)</span>
            </p>
            <p className="text-xs flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full font-semibold">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                +{inwardQty.toLocaleString()} units in
              </span>
              <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 px-2.5 py-0.5 rounded-full font-semibold">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                -{outwardQty.toLocaleString()} units out
              </span>
            </p>
          </div>
        </div>

        {/* Action buttons — same order / style as Products */}
        <div className="flex gap-2 flex-wrap">
          {/* Excel */}
          <button onClick={exportToExcel} style={{ background: "#0D7A5F" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
          {/* PDF */}
          <button onClick={exportToPDF} style={{ background: "#DC2626" }} className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          {/* New Transaction — mirrors Products "+ Add Product" */}
          <button
            onClick={() => { setShowForm(f => !f); if (editingId) cancelEdit(); }}
            style={{ background: showForm ? "#6B7280" : "#E8630A" }}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            {showForm ? "✕ Cancel" : "+ New Transaction"}
          </button>
        </div>
      </div>

      {/* ── TRANSACTION FORM — exact same panel style as Products add form ── */}
      {(showForm || editingId) && (
        <div
          className="bg-white shadow rounded-xl p-5 mb-5"
          style={{ border: `1.5px solid ${editingId ? "#E8630A44" : "#1B3A6B22"}` }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: editingId ? "#E8630A" : "#1B3A6B" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  {editingId
                    ? <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    : <path d="M12 4v16m8-8H4"/>}
                </svg>
              </div>
              <div>
                <p className="font-black text-base" style={{ color: editingId ? "#E8630A" : "#1B3A6B" }}>
                  {editingId ? "Edit Transaction" : "Record New Transaction"}
                </p>
                <p className="text-xs text-gray-400">{editingId ? "Modifying existing entry" : "Fill in the details below"}</p>
              </div>
            </div>
            <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>

          <div className="space-y-4">
            {/* Product Picker */}
            <ProductPicker
              products={products}
              value={form.product_id}
              onChange={id => setForm({ ...form, product_id: id })}
            />

            {/* Location · Type · Qty · Party */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-1.5 text-gray-500">📍 Location</label>
                <select
                  value={form.location_id}
                  onChange={e => setForm({ ...form, location_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none"
                >
                  <option value="">Select Location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-1.5 text-gray-500">↕ Type</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, transaction_type: "inward" })}
                    className="flex-1 py-2.5 text-sm font-black transition-all"
                    style={{
                      background: form.transaction_type === "inward" ? "#0D7A5F" : "#fff",
                      color: form.transaction_type === "inward" ? "#fff" : "#6B7280",
                    }}
                  >▲ IN</button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, transaction_type: "outward" })}
                    className="flex-1 py-2.5 text-sm font-black transition-all"
                    style={{
                      background: form.transaction_type === "outward" ? "#DC2626" : "#fff",
                      color: form.transaction_type === "outward" ? "#fff" : "#6B7280",
                    }}
                  >▼ OUT</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-1.5 text-gray-500"># Quantity</label>
                <input
                  type="number"
                  placeholder="Enter qty"
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-1.5 text-gray-500">🏢 Party Name</label>
                <input
                  type="text"
                  placeholder="Supplier / Customer"
                  value={form.party}
                  onChange={e => setForm({ ...form, party: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none"
                />
              </div>
            </div>

            {/* Notes row */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1.5 text-gray-500">📝 Notes</label>
              <input
                type="text"
                placeholder="Optional notes (e.g. invoice no., remarks)"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none"
              />
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                style={{ background: editingId ? "#E8630A" : "#1B3A6B" }}
                className="flex items-center gap-2 px-8 py-2.5 rounded-lg font-black text-white hover:opacity-90 transition shadow-sm text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {editingId ? "Update Entry" : "Save Entry"}
              </button>
              <button onClick={cancelEdit} className="px-6 py-2.5 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FILTER PILLS — mirrors Products category pill strip exactly ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { key: "all",     label: "All Transactions", color: "#1B3A6B", light: "#EBF0FA" },
          { key: "inward",  label: "▲ Inward",         color: "#0D7A5F", light: "#E6F5F1" },
          { key: "outward", label: "▼ Outward",        color: "#DC2626", light: "#FEF2F2" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilterType(t.key)}
            style={{
              background: filterType === t.key ? t.color : t.light,
              color: filterType === t.key ? "#fff" : t.color,
              border: `1.5px solid ${t.color}`,
            }}
            className="px-3 py-1 rounded-full text-xs font-bold transition-all"
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 self-center text-gray-300">·</span>
        {locations.map(l => (
          <button
            key={l.id}
            onClick={() => setFilterLocation(filterLocation === l.id ? "all" : l.id)}
            style={{
              background: filterLocation === l.id ? "#1B3A6B" : "#EBF0FA",
              color: filterLocation === l.id ? "#fff" : "#1B3A6B",
              border: "1.5px solid #1B3A6B",
            }}
            className="px-3 py-1 rounded-full text-xs font-bold transition-all"
          >
            {l.name}
          </button>
        ))}
      </div>

      {/* ── SEARCH + DATE RANGE row ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            placeholder="Filter by product name or party…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 pl-10 pr-10 py-2.5 rounded-xl text-sm focus:outline-none bg-white shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          )}
        </div>
        {/* Date From */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">From</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="py-2.5 text-sm text-gray-700 font-semibold focus:outline-none bg-transparent"
          />
        </div>
        {/* Date To */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">To</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="py-2.5 text-sm text-gray-700 font-semibold focus:outline-none bg-transparent"
          />
        </div>
        {(filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}
            className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 shadow-sm transition"
          >
            × Clear dates
          </button>
        )}
      </div>

      {/* ── GROUPED TABLE — mirrors Products collapsible category/grade sections ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin mr-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading transactions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="mx-auto mb-3 opacity-40" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          <p className="font-semibold">No transactions found</p>
          <p className="text-sm mt-1">{search ? `No results for "${search}"` : "Record your first transaction above"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dateKeys.map(dateKey => {
            const items      = groupedByDate[dateKey];
            const isOpen     = openDates[dateKey] !== false; // default open
            const dayInward  = items.filter(t => t.transaction_type === "inward").reduce((s, t) => s + (Number(t.quantity) || 0), 0);
            const dayOutward = items.filter(t => t.transaction_type === "outward").reduce((s, t) => s + (Number(t.quantity) || 0), 0);

            return (
              <div key={dateKey} className="rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #1B3A6B22" }}>
                {/* Date group header — mirrors Products category header */}
                <button
                  onClick={() => toggleDate(dateKey)}
                  className="w-full flex items-center justify-between px-5 py-3 transition-colors hover:opacity-95"
                  style={{ background: "#EBF0FA" }}
                >
                  <div className="flex items-center gap-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2.5">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span className="font-black text-sm" style={{ color: "#1B3A6B" }}>
                      {formatDateLabel(`${dateKey}T00:00:00`)}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      {items.length} {items.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {dayInward > 0 && (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: "#E6F5F1", color: "#0D7A5F" }}>
                        +{dayInward.toLocaleString()} IN
                      </span>
                    )}
                    {dayOutward > 0 && (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: "#FEF2F2", color: "#DC2626" }}>
                        -{dayOutward.toLocaleString()} OUT
                      </span>
                    )}
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2.5"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>

                {/* Rows */}
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs font-bold uppercase tracking-wide" style={{ background: "#F8F7F4", borderBottom: "1.5px solid #1B3A6B22" }}>
                          <th className="px-4 py-2 text-left" style={{ color: "#1B3A6B" }}>Time</th>
                          <th className="px-4 py-2 text-left" style={{ color: "#1B3A6B" }}>Product</th>
                          <th className="px-4 py-2 text-center" style={{ color: "#1B3A6B" }}>Type</th>
                          <th className="px-4 py-2 text-center" style={{ color: "#1B3A6B" }}>Qty</th>
                          <th className="px-4 py-2 text-center" style={{ color: "#1B3A6B" }}>Location</th>
                          <th className="px-4 py-2 text-left" style={{ color: "#1B3A6B" }}>Party</th>
                          <th className="px-4 py-2 text-left" style={{ color: "#1B3A6B" }}>Notes</th>
                          <th className="px-4 py-2 text-left" style={{ color: "#1B3A6B" }}>Employee</th>
                          <th className="px-4 py-2 text-center" style={{ color: "#1B3A6B" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 bg-white">
                        {items.map(t => {
                          const product  = products.find(p => p.id === t.product_id);
                          const location = locations.find(l => l.id === t.location_id);
                          const isIn     = t.transaction_type === "inward";
                          const isEditing = editingId === t.id;
                          return (
                            <tr key={t.id} className={`transition hover:bg-blue-50/20 ${isEditing ? "bg-orange-50/40" : ""}`}>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {new Date(t.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
                              </td>
                              <td className="px-4 py-3 font-semibold max-w-xs" style={{ color: "#1B3A6B" }}>
                                <span className="line-clamp-2 leading-snug">
                                  {product?.product_name || <span className="text-gray-300 italic font-normal">Unknown product</span>}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold" style={{
                                  background: isIn ? "#E6F5F1" : "#FEF2F2",
                                  color: isIn ? "#0D7A5F" : "#DC2626",
                                }}>
                                  {isIn ? "▲ IN" : "▼ OUT"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-black tabular-nums text-gray-800">{t.quantity}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums" style={{ background: "#EBF0FA", color: "#1B3A6B" }}>
                                  {location?.name || "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">{t.party || "—"}</td>
                              <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">{t.notes || "—"}</td>
                              <td className="px-4 py-3 text-xs text-gray-400">{t.created_by_email || "System"}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => handleEditClick(t)}
                                    className="text-xs px-2.5 py-1 rounded-md font-medium transition"
                                    style={{ background: "#EBF0FA", color: "#1B3A6B" }}
                                  >Edit</button>
                                  {isAdmin && (
                                    <button
                                      onClick={() => setDeleteConfirm(t)}
                                      className="text-xs px-2.5 py-1 rounded-md font-medium bg-red-50 text-red-600 hover:bg-red-100 transition"
                                    >Delete</button>
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

      {/* ── PAGINATION — same style as Products ── */}
      {!loading && totalPages > 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-3.5 flex justify-between items-center mt-5">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all"
            style={{ background: page === 0 ? "#F3F4F6" : "#1B3A6B", color: page === 0 ? "#9CA3AF" : "#fff" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
            Prev
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#1B3A6B" }}>Page {page + 1} of {totalPages}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs font-semibold text-gray-400">{totalCount.toLocaleString()} total</span>
          </div>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page + 1 >= totalPages}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all"
            style={{ background: page + 1 >= totalPages ? "#F3F4F6" : "#E8630A", color: page + 1 >= totalPages ? "#9CA3AF" : "#fff" }}
          >
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-lg text-red-600 mb-2">Delete Transaction?</h3>
            <p className="text-sm text-gray-600 mb-5">
              This will permanently delete the transaction for{" "}
              <span className="font-semibold">{products.find(p => p.id === deleteConfirm.product_id)?.product_name || "this product"}</span>.
              This cannot be undone.
            </p>
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
