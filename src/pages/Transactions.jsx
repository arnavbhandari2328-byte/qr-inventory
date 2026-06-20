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
          return (a.product_id || "").localeCompare(b.product_id || "");
        })
        .forEach(p => ordered.push({ ...p, _material: mat, _category: cat }));
    });
  });
  return ordered;
}

// ── Product Picker ────────────────────────────────────────────────────────────

function ProductPicker({ products, value, onChange }) {
  const [query, setQuery]             = useState("");
  const [open, setOpen]               = useState(false);
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
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// ── TYPE FILTER CONFIG (mirrors category pills in Products) ───────────────────

const TYPE_FILTERS = [
  { key: "all",     label: "All",     icon: "◈", color: "#1B3A6B", light: "#EBF0FA" },
  { key: "inward",  label: "Inward",  icon: "▲", color: "#0D7A5F", light: "#E6F5F1" },
  { key: "outward", label: "Outward", icon: "▼", color: "#DC2626", light: "#FEF2F2" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function Transactions() {
  const [products, setProducts]             = useState([]);
  const [locations, setLocations]           = useState([]);
  const [transactions, setTransactions]     = useState([]);
  const [search, setSearch]                 = useState("");
  const [filterType, setFilterType]         = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo]     = useState("");
  const [loading, setLoading]               = useState(true);
  const [editingId, setEditingId]           = useState(null);
  const [isAdmin, setIsAdmin]               = useState(false);
  const [showForm, setShowForm]             = useState(false);
  const [deleteConfirm, setDeleteConfirm]   = useState(null);

  // Collapsible date groups — mirrors Products collapsible categories
  const [openDates, setOpenDates] = useState({});

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
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        product_id:       form.product_id,
        location_id:      form.location_id,
        transaction_type: form.transaction_type,
        quantity:         Number(form.quantity),
        party:            form.party,
        notes:            form.notes || null,
        created_by_email: user?.email || "Unknown",
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
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}`, pageW - 14, 12, { align: "right" });
      const rows = (allTrans || []).map(t => [
        formatIST(t.created_at),
        products.find(p => p.id === t.product_id)?.product_name || "—",
        t.transaction_type.toUpperCase(),
        t.quantity,
        locations.find(l => l.id === t.location_id)?.name || "—",
        t.party || "—",
        t.notes || "—",
        t.created_by_email || "System",
      ]);
      autoTable(doc, {
        startY: 22,
        head: [["Date", "Product", "Type", "Qty", "Location", "Party", "Notes", "Employee"]],
        body: rows,
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [27, 58, 107], textColor: [255,255,255], fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [250,250,250] },
        columnStyles: {
          0: { cellWidth: 30 }, 1: { cellWidth: "auto" },
          2: { cellWidth: 16, halign: "center" }, 3: { cellWidth: 14, halign: "center" },
          4: { cellWidth: 22 }, 5: { cellWidth: 24 }, 6: { cellWidth: 30 }, 7: { cellWidth: 26 },
        },
        margin: { left: 10, right: 10 },
      });
      doc.save(`Nivee_Transactions_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) { alert("PDF export failed: " + e.message); }
  };

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = transactions.filter(t => {
    const product = products.find(p => p.id === t.product_id);
    const productName = product?.product_name || "";
    const productId   = product?.product_id   || "";
    const locationName = locations.find(l => l.id === t.location_id)?.name || "";

    const matchSearch = search.trim() === "" ||
      productName.toLowerCase().includes(search.toLowerCase()) ||
      productId.toLowerCase().includes(search.toLowerCase()) ||
      (t.party || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.notes || "").toLowerCase().includes(search.toLowerCase());

    const matchType = filterType === "all" || t.transaction_type === filterType;
    const matchLoc  = filterLocation === "all" || t.location_id === filterLocation;

    const txDate = isoToLocalDate(t.created_at);
    const matchFrom = !filterDateFrom || txDate >= filterDateFrom;
    const matchTo   = !filterDateTo   || txDate <= filterDateTo;

    return matchSearch && matchType && matchLoc && matchFrom && matchTo;
  });

  // ── Group by date ─────────────────────────────────────────────────────────

  const dateGroups = {};
  filtered.forEach(t => {
    const dateKey = isoToLocalDate(t.created_at);
    if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
    dateGroups[dateKey].push(t);
  });
  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

  const toggleDate = key => setOpenDates(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Counts ────────────────────────────────────────────────────────────────

  const inwardCount  = transactions.filter(t => t.transaction_type === "inward").length;
  const outwardCount = transactions.filter(t => t.transaction_type === "outward").length;

  const typeCounts = {
    all:     transactions.length,
    inward:  inwardCount,
    outward: outwardCount,
  };

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh" }} className="p-4 md:p-6 max-w-screen-xl mx-auto">

      {/* ── HEADER (mirrors Products header exactly) ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div style={{ background: "#1B3A6B", borderRadius: 10 }} className="w-9 h-9 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
            </div>
            <h1 style={{ color: "#1B3A6B" }} className="text-2xl font-black tracking-tight">Transactions</h1>
          </div>
          <div className="ml-12 flex flex-col gap-0.5">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{totalCount.toLocaleString()}</span> total transactions
              {" · "}
              <span style={{ color: "#0D7A5F" }} className="font-semibold">{inwardCount.toLocaleString()} inward</span>
              {" · "}
              <span style={{ color: "#DC2626" }} className="font-semibold">{outwardCount.toLocaleString()} outward</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportToExcel}
            style={{ background: "#0D7A5F" }}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
          <button
            onClick={exportToPDF}
            style={{ background: "#DC2626" }}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setEditingId(null); setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "", notes: "" }); }}
            style={{ background: showForm ? "#6B7280" : "#E8630A" }}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            {showForm ? "✕ Cancel" : "+ Add Transaction"}
          </button>
        </div>
      </div>

      {/* ── ADD / EDIT FORM (mirrors Products add form) ── */}
      {showForm && (
        <div className="bg-white border border-orange-200 shadow rounded-xl p-5 mb-5">
          <h3 className="font-black text-base mb-3" style={{ color: "#E8630A" }}>
            {editingId ? "✏️ Edit Transaction" : "+ Add New Transaction"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Product Picker — full width */}
            <ProductPicker products={products} value={form.product_id} onChange={id => setForm(f => ({ ...f, product_id: id }))} />

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Location <span className="text-red-400">*</span></label>
              <select
                value={form.location_id}
                onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Type <span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                {["inward", "outward"].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, transaction_type: type }))}
                    className="flex-1 py-2 rounded-lg text-sm font-bold border-2 transition"
                    style={{
                      background: form.transaction_type === type ? (type === "inward" ? "#0D7A5F" : "#DC2626") : "white",
                      color: form.transaction_type === type ? "white" : (type === "inward" ? "#0D7A5F" : "#DC2626"),
                      borderColor: type === "inward" ? "#0D7A5F" : "#DC2626",
                    }}
                  >
                    {type === "inward" ? "▲ Inward" : "▼ Outward"}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Quantity <span className="text-red-400">*</span></label>
              <input
                type="number"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="e.g. 50"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            {/* Party */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Party / Customer</label>
              <input
                value={form.party}
                onChange={e => setForm(f => ({ ...f, party: e.target.value }))}
                placeholder="e.g. Rajesh Steel"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional note"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              style={{ background: "#E8630A" }}
              className="text-white px-5 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition"
            >
              {editingId ? "Update Transaction" : "Save Transaction"}
            </button>
            <button onClick={cancelEdit} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── SEARCH (mirrors Products search bar) ── */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by product name, ID, party or notes…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* ── FILTER PILLS (mirrors Products category pills) ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_FILTERS.map(tf => {
          const isActive = filterType === tf.key;
          const count = typeCounts[tf.key] || 0;
          return (
            <button
              key={tf.key}
              onClick={() => setFilterType(isActive && tf.key !== "all" ? "all" : tf.key)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border"
              style={{
                background: isActive ? tf.color : "white",
                color: isActive ? "white" : tf.color,
                borderColor: tf.color,
                boxShadow: isActive ? `0 2px 8px ${tf.color}40` : "none",
              }}
            >
              <span style={{ fontSize: "0.7rem" }}>{tf.icon}</span>
              {tf.label} <span style={{ opacity: 0.8 }}>({count})</span>
            </button>
          );
        })}

        {/* Location filter pills */}
        {locations.map(loc => {
          const isActive = filterLocation === loc.id;
          return (
            <button
              key={loc.id}
              onClick={() => setFilterLocation(isActive ? "all" : loc.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border"
              style={{
                background: isActive ? "#1B3A6B" : "white",
                color: isActive ? "white" : "#1B3A6B",
                borderColor: "#1B3A6B",
                boxShadow: isActive ? "0 2px 8px #1B3A6B40" : "none",
              }}
            >
              🏭 {loc.name}
            </button>
          );
        })}

        {/* Date range */}
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {(filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}
              className="text-xs text-gray-400 hover:text-red-500 transition px-1"
            >✕</button>
          )}
        </div>
      </div>

      {/* ── LOADING ── */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin mr-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading transactions…
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-gray-500 font-semibold">No transactions found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search || filterType !== "all" || filterLocation !== "all" || filterDateFrom || filterDateTo
              ? "Try adjusting your filters"
              : "Add your first transaction using the button above"}
          </p>
        </div>
      )}

      {/* ── DATE-GROUPED TRANSACTION TABLES (mirrors Products category groups) ── */}
      {!loading && sortedDates.map(dateKey => {
        const items = dateGroups[dateKey];
        const isOpen = openDates[dateKey] !== false;
        const dayInward  = items.filter(t => t.transaction_type === "inward").reduce((s, t) => s + Number(t.quantity), 0);
        const dayOutward = items.filter(t => t.transaction_type === "outward").reduce((s, t) => s + Number(t.quantity), 0);

        return (
          <div key={dateKey} className="mb-4 rounded-xl overflow-hidden shadow-sm border border-gray-200">
            {/* Date group header — mirrors Products category header */}
            <button
              onClick={() => toggleDate(dateKey)}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition hover:opacity-90"
              style={{ background: "#1B3A6B" }}
            >
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <div>
                  <span className="text-white font-black text-sm">{formatDateLabel(dateKey + "T00:00:00")}</span>
                  <span className="text-white/70 text-xs ml-2">{items.length} transactions</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {dayInward > 0  && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#0D7A5F22", color: "#6EE7B7" }}>▲ {dayInward.toLocaleString()} in</span>}
                {dayOutward > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#DC262622", color: "#FCA5A5" }}>▼ {dayOutward.toLocaleString()} out</span>}
                <svg className={`text-white transition-transform ${isOpen ? "rotate-180" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </button>

            {/* Transaction rows table — mirrors Products grade table */}
            {isOpen && (
              <div className="bg-white overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 w-36">Time</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400">Product</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-24">Type</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-20">Qty</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 w-28">Location</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 w-32">Party</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400">Notes</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 w-28">Employee</th>
                      {isAdmin && <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-400 w-24">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t, idx) => {
                      const product  = products.find(p => p.id === t.product_id);
                      const location = locations.find(l => l.id === t.location_id);
                      const isIn     = t.transaction_type === "inward";

                      return (
                        <tr
                          key={t.id}
                          className={`border-b border-gray-50 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30`}
                        >
                          {/* Time */}
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs text-gray-500">
                              {new Date(t.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
                            </span>
                          </td>

                          {/* Product */}
                          <td className="px-4 py-2.5">
                            <div>
                              <span className="font-semibold text-gray-800 text-sm">{product?.product_name || <span className="text-gray-400 italic">Unknown product</span>}</span>
                              {product?.product_id && (
                                <span className="ml-2 font-mono text-xs text-gray-400">{product.product_id}</span>
                              )}
                            </div>
                          </td>

                          {/* Type badge */}
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border"
                              style={{
                                background: isIn ? "#E6F5F1" : "#FEF2F2",
                                color: isIn ? "#0D7A5F" : "#DC2626",
                                borderColor: isIn ? "#A7F3D0" : "#FECACA",
                              }}
                            >
                              {isIn ? "▲ IN" : "▼ OUT"}
                            </span>
                          </td>

                          {/* Qty */}
                          <td className="px-4 py-2.5 text-center">
                            <span className={`font-black text-sm ${isIn ? "text-green-700" : "text-red-600"}`}>
                              {isIn ? "+" : "−"}{Number(t.quantity).toLocaleString()}
                            </span>
                          </td>

                          {/* Location */}
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-semibold text-gray-600 capitalize">{location?.name || "—"}</span>
                          </td>

                          {/* Party */}
                          <td className="px-4 py-2.5">
                            <span className="text-xs text-gray-600">{t.party || <span className="text-gray-300">—</span>}</span>
                          </td>

                          {/* Notes */}
                          <td className="px-4 py-2.5">
                            <span className="text-xs text-gray-500">{t.notes || <span className="text-gray-300">—</span>}</span>
                          </td>

                          {/* Employee */}
                          <td className="px-4 py-2.5">
                            <span className="text-xs text-gray-400 truncate max-w-[110px] block">{t.created_by_email || "System"}</span>
                          </td>

                          {/* Actions (admin only) */}
                          {isAdmin && (
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleEditClick(t)}
                                  title="Edit"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(t.id)}
                                  title="Delete"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                </button>
                              </div>
                            </td>
                          )}
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

      {/* ── PAGINATION ── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-gray-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()} transactions
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ background: "#1B3A6B" }}
              className="text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="flex items-center px-3 text-sm text-gray-600 font-semibold">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ background: "#1B3A6B" }}
              className="text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL (mirrors Products delete modal) ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="font-black text-base text-gray-800 mb-2">Delete Transaction?</h3>
            <p className="text-sm text-gray-500 mb-5">This will permanently delete this transaction and adjust stock accordingly. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition">
                Yes, Delete
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
