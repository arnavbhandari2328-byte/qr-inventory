import { useEffect, useState, useRef, useCallback } from "react";
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

// Convert a local YYYY-MM-DD to an ISO UTC range for Supabase filtering
function localDateToUTCRange(dateStr, isEnd = false) {
  if (!dateStr) return null;
  // Interpret the date string as IST (UTC+5:30)
  const [y, m, d] = dateStr.split("-").map(Number);
  const offsetMs = 5.5 * 60 * 60 * 1000; // IST offset
  if (!isEnd) {
    // Start of day IST → UTC
    const startIST = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    return new Date(startIST.getTime() - offsetMs).toISOString();
  } else {
    // End of day IST → UTC
    const endIST = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return new Date(endIST.getTime() - offsetMs).toISOString();
  }
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

  // Separate counts for type-pill badges (unfiltered by type/location/date)
  const [allTypeCounts, setAllTypeCounts] = useState({ all: 0, inward: 0, outward: 0 });

  const [form, setForm] = useState({
    product_id: "", location_id: "", transaction_type: "inward",
    quantity: "", party: "", notes: "",
  });

  useEffect(() => { checkUserRole(); fetchDropdowns(); fetchTypeCounts(); }, []);

  // Re-fetch whenever any filter or page changes
  useEffect(() => { fetchTransactions(); }, [page, search, filterType, filterLocation, filterDateFrom, filterDateTo]);

  // When filters change (not page), always reset to page 0.
  // The page reset itself triggers the fetchTransactions above.
  useEffect(() => { setPage(0); }, [search, filterType, filterLocation, filterDateFrom, filterDateTo]);

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

  // Fetch total inward/outward counts for the type pills (no filters applied)
  async function fetchTypeCounts() {
    const [{ count: total }, { count: inward }, { count: outward }] = await Promise.all([
      supabase.from("transactions").select("id", { count: "exact", head: true }),
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("transaction_type", "inward"),
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("transaction_type", "outward"),
    ]);
    setAllTypeCounts({
      all:     total   || 0,
      inward:  inward  || 0,
      outward: outward || 0,
    });
  }

  // ── Server-side filtered + paginated fetch ────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      let query = supabase
        .from("transactions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      // Server-side type filter
      if (filterType !== "all") {
        query = query.eq("transaction_type", filterType);
      }

      // Server-side location filter
      if (filterLocation !== "all") {
        query = query.eq("location_id", filterLocation);
      }

      // Server-side date range filter (convert IST → UTC)
      const utcFrom = localDateToUTCRange(filterDateFrom, false);
      const utcTo   = localDateToUTCRange(filterDateTo, true);
      if (utcFrom) query = query.gte("created_at", utcFrom);
      if (utcTo)   query = query.lte("created_at", utcTo);

      // Server-side party/notes text search (Postgres ilike)
      // Product name search is still client-side below (requires join)
      if (search.trim()) {
        query = query.or(
          `party.ilike.%${search.trim()}%,notes.ilike.%${search.trim()}%`
        );
      }

      const { data, count, error } = await query;
      if (error) throw error;

      setTransactions(data || []);
      if (count !== null) setTotalCount(count);
    } catch (err) {
      console.error("Failed fetching transactions", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType, filterLocation, filterDateFrom, filterDateTo]);

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
      fetchTypeCounts();
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
    fetchTypeCounts();
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

  // ── Client-side product-name search overlay ───────────────────────────────
  // Party/notes are already filtered server-side. We additionally filter
  // locally for product_name / product_id matches so the search feels complete.
  const filtered = search.trim()
    ? transactions.filter(t => {
        const product = products.find(p => p.id === t.product_id);
        const productName = product?.product_name || "";
        const productId   = product?.product_id   || "";
        const searchLower = search.toLowerCase();
        return (
          productName.toLowerCase().includes(searchLower) ||
          productId.toLowerCase().includes(searchLower) ||
          (t.party || "").toLowerCase().includes(searchLower) ||
          (t.notes || "").toLowerCase().includes(searchLower)
        );
      })
    : transactions;

  // ── Group by date ─────────────────────────────────────────────────────────

  const dateGroups = {};
  filtered.forEach(t => {
    const dateKey = isoToLocalDate(t.created_at);
    if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
    dateGroups[dateKey].push(t);
  });
  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

  const toggleDate = key => setOpenDates(prev => ({ ...prev, [key]: !prev[key] }));

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
              <span className="font-semibold text-gray-700">{totalCount.toLocaleString()}</span> matching transactions
              {" · "}
              <span style={{ color: "#0D7A5F" }} className="font-semibold">{allTypeCounts.inward.toLocaleString()} inward</span>
              {" · "}
              <span style={{ color: "#DC2626" }} className="font-semibold">{allTypeCounts.outward.toLocaleString()} outward</span>
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
          const count = allTypeCounts[tf.key] || 0;
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
              {tf.label} <span style={{ opacity: 0.8 }}>({count.toLocaleString()})</span>
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
              📍 {loc.name}
            </button>
          );
        })}
      </div>

      {/* ── DATE RANGE FILTER ── */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">From</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">To</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>
        {(filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}
            className="text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition"
          >
            ✕ Clear dates
          </button>
        )}
      </div>

      {/* ── TRANSACTION LIST ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-3xl mb-3 animate-spin inline-block">⟳</div>
          <p className="text-sm">Loading transactions…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p className="font-semibold text-gray-500">No transactions found</p>
          <p className="text-sm mt-1">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <>
          {sortedDates.map(dateKey => {
            const isOpen = openDates[dateKey] !== false; // default open
            const rows   = dateGroups[dateKey];
            return (
              <div key={dateKey} className="mb-4">
                {/* Date group header */}
                <button
                  onClick={() => toggleDate(dateKey)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-bold transition hover:opacity-90"
                  style={{ background: "#1B3A6B", color: "white" }}
                >
                  <span className="flex items-center gap-2">
                    📅 {formatDateLabel(dateKey + "T00:00:00")}
                    <span className="text-xs font-normal opacity-75 ml-1">({rows.length} entries)</span>
                  </span>
                  <span>{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="mt-1 rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "#F1F5FB" }} className="text-xs uppercase tracking-wider">
                          <th className="px-4 py-2.5 text-left font-bold" style={{ color: "#1B3A6B" }}>Time</th>
                          <th className="px-4 py-2.5 text-left font-bold" style={{ color: "#1B3A6B" }}>Product</th>
                          <th className="px-4 py-2.5 text-center font-bold" style={{ color: "#1B3A6B" }}>Type</th>
                          <th className="px-4 py-2.5 text-center font-bold" style={{ color: "#1B3A6B" }}>Qty</th>
                          <th className="px-4 py-2.5 text-left font-bold" style={{ color: "#1B3A6B" }}>Location</th>
                          <th className="px-4 py-2.5 text-left font-bold" style={{ color: "#1B3A6B" }}>Party</th>
                          <th className="px-4 py-2.5 text-left font-bold" style={{ color: "#1B3A6B" }}>Notes</th>
                          <th className="px-4 py-2.5 text-left font-bold" style={{ color: "#1B3A6B" }}>By</th>
                          {isAdmin && <th className="px-4 py-2.5 text-center font-bold" style={{ color: "#1B3A6B" }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((t, i) => {
                          const product  = products.find(p => p.id === t.product_id);
                          const location = locations.find(l => l.id === t.location_id);
                          const isIn     = t.transaction_type === "inward";
                          return (
                            <tr
                              key={t.id}
                              className="hover:bg-blue-50/40 transition-colors"
                              style={{ background: i % 2 === 0 ? "white" : "#FAFAFA" }}
                            >
                              <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                                {new Date(t.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-gray-800 max-w-xs">
                                <div className="truncate">{product?.product_name || <span className="text-gray-400 italic">Unknown</span>}</div>
                                {product?.product_id && <div className="text-xs text-gray-400 font-normal">{product.product_id}</div>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                                  style={{
                                    background: isIn ? "#E6F5F1" : "#FEF2F2",
                                    color:      isIn ? "#0D7A5F" : "#DC2626",
                                  }}
                                >
                                  {isIn ? "▲" : "▼"} {t.transaction_type.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center font-bold" style={{ color: isIn ? "#0D7A5F" : "#DC2626" }}>
                                {isIn ? "+" : "−"}{t.quantity}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs">{location?.name || "—"}</td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs">{t.party || "—"}</td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[160px]">
                                <div className="truncate">{t.notes || "—"}</div>
                              </td>
                              <td className="px-4 py-2.5 text-gray-400 text-xs">
                                <div className="truncate max-w-[120px]">{t.created_by_email || "System"}</div>
                              </td>
                              {isAdmin && (
                                <td className="px-4 py-2.5 text-center">
                                  <div className="flex justify-center gap-1">
                                    <button
                                      onClick={() => handleEditClick(t)}
                                      className="p-1.5 rounded-lg hover:bg-blue-100 transition text-blue-600"
                                      title="Edit"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(t.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-100 transition text-red-500"
                                      title="Delete"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 px-2">
              <p className="text-sm text-gray-500">
                Showing{" "}
                <span className="font-semibold text-gray-700">
                  {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-gray-700">{totalCount.toLocaleString()}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="px-2 py-1.5 rounded-lg text-sm font-semibold border transition disabled:opacity-30"
                  style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
                  title="First page"
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border transition disabled:opacity-30"
                  style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
                >‹ Prev</button>

                {/* Page number pills */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Show pages around current page
                  let start = Math.max(0, page - 2);
                  if (start + 5 > totalPages) start = Math.max(0, totalPages - 5);
                  const p = start + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="w-9 h-9 rounded-lg text-sm font-bold border transition"
                      style={{
                        background: p === page ? "#1B3A6B" : "white",
                        color:      p === page ? "white"   : "#1B3A6B",
                        borderColor: p === page ? "#1B3A6B" : "#D1D5DB",
                      }}
                    >
                      {p + 1}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border transition disabled:opacity-30"
                  style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
                >Next ›</button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1.5 rounded-lg text-sm font-semibold border transition disabled:opacity-30"
                  style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
                  title="Last page"
                >»</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🗑️</div>
              <h3 className="font-black text-lg text-gray-800">Delete Transaction?</h3>
              <p className="text-sm text-gray-500 mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90"
                style={{ background: "#DC2626" }}
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
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
