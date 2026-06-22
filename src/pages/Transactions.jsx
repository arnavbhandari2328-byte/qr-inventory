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
  const [y, m, d] = dateStr.split("-").map(Number);
  const offsetMs = 5.5 * 60 * 60 * 1000;
  if (!isEnd) {
    const startIST = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    return new Date(startIST.getTime() - offsetMs).toISOString();
  } else {
    const endIST = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return new Date(endIST.getTime() - offsetMs).toISOString();
  }
}

// ── TYPE FILTER CONFIG ────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { key: "all",     label: "All",     icon: "◈", color: "#1B3A6B", light: "#EBF0FA" },
  { key: "inward",  label: "Inward",  icon: "▲", color: "#0D7A5F", light: "#E6F5F1" },
  { key: "outward", label: "Outward", icon: "▼", color: "#DC2626", light: "#FEF2F2" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function Transactions() {
  const [products, setProducts]             = useState([]);
  const [locations, setLocations]           = useState([]);
  // productMap: uuid -> {product_name, product_id} for fast lookup in render
  const [productMap, setProductMap]         = useState({});
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

  const [openDates, setOpenDates] = useState({});

  const [page, setPage]             = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  // Global unfiltered counts for type-pill badges
  const [allTypeCounts, setAllTypeCounts] = useState({ all: 0, inward: 0, outward: 0 });

  const [form, setForm] = useState({
    product_id: "", location_id: "", transaction_type: "inward",
    quantity: "", party: "", notes: "",
  });

  useEffect(() => { checkUserRole(); fetchDropdowns(); fetchTypeCounts(); }, []);

  // Re-fetch whenever any filter or page changes
  useEffect(() => { fetchTransactions(); }, [page, search, filterType, filterLocation, filterDateFrom, filterDateTo]);

  // When filters change (not page), always reset to page 0
  useEffect(() => { setPage(0); }, [search, filterType, filterLocation, filterDateFrom, filterDateTo]);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (ADMIN_EMAILS.includes(user?.email)) setIsAdmin(true);
  };

  async function fetchDropdowns() {
    const [{ data: prod }, { data: loc }] = await Promise.all([
      supabase.from("products").select("*"),
      supabase.from("locations").select("*"),
    ]);
    const pList = prod || [];
    setProducts(pList);
    // Build a fast lookup map by UUID
    const map = {};
    pList.forEach(p => { map[p.id] = p; });
    setProductMap(map);
    setLocations(loc || []);
  }

  // Fetch total inward/outward counts for the type pills (no filters)
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

      // ── STRATEGY: use products(id) join so Postgres can filter by product name ──
      // The select string "*, products!inner(id,product_name,product_id)" pulls the
      // joined product columns alongside every transaction row. We then use
      // products.product_name.ilike and products.product_id.ilike for product search.

      const searchTerm = search.trim();

      // Decide join type: inner when searching by product name so non-matching rows
      // are excluded at DB level; left join otherwise to keep all transactions.
      const joinType = searchTerm ? "products!inner" : "products";

      let query = supabase
        .from("transactions")
        .select(`*, ${joinType}(id, product_name, product_id)`, { count: "exact" })
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

      // Server-side date range (IST → UTC)
      const utcFrom = localDateToUTCRange(filterDateFrom, false);
      const utcTo   = localDateToUTCRange(filterDateTo, true);
      if (utcFrom) query = query.gte("created_at", utcFrom);
      if (utcTo)   query = query.lte("created_at", utcTo);

      // Server-side text search across party, notes, AND product name/id
      if (searchTerm) {
        query = query.or(
          [
            `party.ilike.%${searchTerm}%`,
            `notes.ilike.%${searchTerm}%`,
            `products.product_name.ilike.%${searchTerm}%`,
            `products.product_id.ilike.%${searchTerm}%`,
          ].join(",")
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
      const { data: allTrans } = await supabase
        .from("transactions")
        .select("*, products(product_name)")
        .order("created_at", { ascending: false });
      const exportData = (allTrans || []).map(t => ({
        Date_IST:  formatIST(t.created_at),
        Product:   t.products?.product_name || productMap[t.product_id]?.product_name || "—",
        Type:      t.transaction_type.toUpperCase(),
        Quantity:  t.quantity,
        Location:  locations.find(l => l.id === t.location_id)?.name || "—",
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
      const { data: allTrans, error } = await supabase
        .from("transactions")
        .select("*, products(product_name)")
        .order("created_at", { ascending: false });
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
        t.products?.product_name || productMap[t.product_id]?.product_name || "—",
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

  // ── NO client-side filtering needed — everything is server-side ──────────
  // The `transactions` array is already the correct filtered+paginated page.
  const filtered = transactions;

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

  // Helper: resolve product name from a transaction row
  // The join attaches a `products` object on each row; fall back to productMap
  const getProductName = (t) =>
    t.products?.product_name || productMap[t.product_id]?.product_name || "Unknown";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh" }} className="p-4 md:p-6 max-w-screen-xl mx-auto">

      {/* ── HEADER ── */}
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {showForm ? "Cancel" : "+ Add Transaction"}
          </button>
        </div>
      </div>

      {/* ── ADD / EDIT FORM ── */}
      {showForm && (
        <div className="rounded-2xl border mb-6 overflow-hidden shadow-lg" style={{ borderColor: "#D1D5DB", background: "white" }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: "#1B3A6B" }}>
            <h2 className="text-white font-bold text-base">{editingId ? "✏️ Edit Transaction" : "➕ New Transaction"}</h2>
            <button onClick={cancelEdit} className="text-white/70 hover:text-white text-xl">×</button>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProductPicker products={products} value={form.product_id} onChange={v => setForm(f => ({ ...f, product_id: v }))} />
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: "#1B3A6B" }}>📍 Location</label>
              <select
                value={form.location_id}
                onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                className="w-full rounded-xl border-2 px-4 py-3 text-sm font-medium focus:outline-none"
                style={{ borderColor: form.location_id ? "#1B3A6B" : "#D1D5DB" }}
              >
                <option value="">Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: "#1B3A6B" }}>⬆⬇ Type</label>
              <div className="flex gap-2">
                {["inward", "outward"].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, transaction_type: type }))}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all"
                    style={{
                      background: form.transaction_type === type ? (type === "inward" ? "#0D7A5F" : "#DC2626") : "white",
                      color: form.transaction_type === type ? "white" : "#374151",
                      borderColor: form.transaction_type === type ? (type === "inward" ? "#0D7A5F" : "#DC2626") : "#D1D5DB",
                    }}
                  >
                    {type === "inward" ? "▲ Inward" : "▼ Outward"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: "#1B3A6B" }}>🔢 Quantity</label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="Enter quantity…"
                className="w-full rounded-xl border-2 px-4 py-3 text-sm font-medium focus:outline-none"
                style={{ borderColor: form.quantity ? "#1B3A6B" : "#D1D5DB" }}
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: "#1B3A6B" }}>👤 Party (optional)</label>
              <input
                type="text"
                value={form.party}
                onChange={e => setForm(f => ({ ...f, party: e.target.value }))}
                placeholder="Customer / supplier name…"
                className="w-full rounded-xl border-2 px-4 py-3 text-sm font-medium focus:outline-none"
                style={{ borderColor: "#D1D5DB" }}
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: "#1B3A6B" }}>📝 Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes…"
                className="w-full rounded-xl border-2 px-4 py-3 text-sm font-medium focus:outline-none"
                style={{ borderColor: "#D1D5DB" }}
              />
            </div>
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <button
              onClick={handleSave}
              style={{ background: "#E8630A" }}
              className="flex-1 text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 transition"
            >
              {editingId ? "💾 Save Changes" : "✅ Add Transaction"}
            </button>
            <button onClick={cancelEdit} className="px-6 py-3 rounded-xl border-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition" style={{ borderColor: "#D1D5DB" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── SEARCH BAR ── */}
      <div className="relative mb-4">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by product name, ID, party or notes…"
          className="w-full pl-11 pr-4 py-3 rounded-xl border-2 text-sm focus:outline-none transition"
          style={{ borderColor: search ? "#E8630A" : "#D1D5DB", background: "white" }}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl">×</button>
        )}
      </div>

      {/* ── TYPE PILLS ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterType(f.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border-2 transition-all"
            style={{
              background:   filterType === f.key ? f.color   : f.light,
              color:        filterType === f.key ? "white"   : f.color,
              borderColor:  filterType === f.key ? f.color   : "transparent",
            }}
          >
            <span style={{ fontSize: "0.6rem" }}>{f.icon}</span>
            {f.label}
            <span className="ml-1 text-xs opacity-80">
              ({f.key === "all" ? totalCount.toLocaleString() : allTypeCounts[f.key].toLocaleString()})
            </span>
          </button>
        ))}
        {/* Location pills */}
        {locations.map(loc => (
          <button
            key={loc.id}
            onClick={() => setFilterLocation(prev => prev === loc.id ? "all" : loc.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border-2 transition-all"
            style={{
              background:  filterLocation === loc.id ? "#E8630A" : "#FEF0E7",
              color:       filterLocation === loc.id ? "white"   : "#E8630A",
              borderColor: filterLocation === loc.id ? "#E8630A" : "transparent",
            }}
          >
            <span style={{ fontSize: "0.6rem" }}>📍</span>
            {loc.name}
          </button>
        ))}
      </div>

      {/* ── DATE RANGE ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className="text-sm font-semibold text-gray-600">From</span>
        <input
          type="date"
          value={filterDateFrom}
          onChange={e => setFilterDateFrom(e.target.value)}
          className="border-2 rounded-lg px-3 py-1.5 text-sm focus:outline-none transition"
          style={{ borderColor: filterDateFrom ? "#1B3A6B" : "#D1D5DB" }}
        />
        <span className="text-sm font-semibold text-gray-600">To</span>
        <input
          type="date"
          value={filterDateTo}
          onChange={e => setFilterDateTo(e.target.value)}
          className="border-2 rounded-lg px-3 py-1.5 text-sm focus:outline-none transition"
          style={{ borderColor: filterDateTo ? "#1B3A6B" : "#D1D5DB" }}
        />
        {(filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}
            className="text-xs text-gray-500 hover:text-red-500 underline"
          >
            Clear dates
          </button>
        )}
      </div>

      {/* ── TRANSACTIONS LIST ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-gray-200 animate-spin" style={{ borderTopColor: "#1B3A6B" }} />
            <span className="text-sm text-gray-500 font-medium">Loading transactions…</span>
          </div>
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-lg font-semibold">No transactions found</p>
          <p className="text-sm mt-1">Try adjusting your filters or search term</p>
        </div>
      ) : (
        <>
          {sortedDates.map(dateKey => {
            const group     = dateGroups[dateKey];
            const isOpen    = openDates[dateKey] !== false; // default open
            const dateLabel = formatDateLabel(group[0].created_at);

            return (
              <div key={dateKey} className="mb-4 rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor: "#E5E7EB" }}>
                {/* Date header */}
                <button
                  onClick={() => toggleDate(dateKey)}
                  className="w-full flex items-center justify-between px-5 py-3 transition-colors"
                  style={{ background: "#1B3A6B" }}
                >
                  <div className="flex items-center gap-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span className="text-white font-bold text-sm">{dateLabel}</span>
                    <span className="text-white/60 text-xs font-medium">({group.length} entries)</span>
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"
                    style={{ transform: isOpen ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}
                  >
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "#F3F4F6", borderBottom: "2px solid #E5E7EB" }}>
                          {["TIME", "PRODUCT", "TYPE", "QTY", "LOCATION", "PARTY", "NOTES", "BY", "ACTIONS"].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-black tracking-widest" style={{ color: "#6B7280" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((t, i) => {
                          const productName = getProductName(t);
                          const locationName = locations.find(l => l.id === t.location_id)?.name || "—";
                          const isEven = i % 2 === 0;

                          return (
                            <tr
                              key={t.id}
                              style={{ background: isEven ? "white" : "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}
                              className="hover:bg-blue-50/30 transition-colors"
                            >
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-medium">
                                {new Date(t.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-800 max-w-[200px]">
                                <span className={productName === "Unknown" ? "italic text-gray-400" : ""}>
                                  {productName}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
                                  style={{
                                    background: t.transaction_type === "inward" ? "#E6F5F1" : "#FEF2F2",
                                    color:      t.transaction_type === "inward" ? "#0D7A5F" : "#DC2626",
                                  }}
                                >
                                  {t.transaction_type === "inward" ? "▲" : "▼"} {t.transaction_type.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-bold tabular-nums" style={{ color: t.transaction_type === "inward" ? "#0D7A5F" : "#DC2626" }}>
                                {t.transaction_type === "inward" ? "+" : "-"}{t.quantity}
                              </td>
                              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{locationName}</td>
                              <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{t.party || "—"}</td>
                              <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate text-xs">{t.notes || "—"}</td>
                              <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{t.created_by_email?.split("@")[0] || "System"}</td>
                              <td className="px-4 py-3">
                                {isAdmin && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleEditClick(t)}
                                      className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                                      title="Edit"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2.5">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                      </svg>
                                    </button>
                                    {deleteConfirm === t.id ? (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleDelete(t.id)}
                                          className="px-2 py-1 rounded text-xs font-bold text-white"
                                          style={{ background: "#DC2626" }}
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          onClick={() => setDeleteConfirm(null)}
                                          className="px-2 py-1 rounded text-xs font-bold text-gray-600 border"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setDeleteConfirm(t.id)}
                                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                        title="Delete"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5">
                                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                )}
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

          {/* ── PAGINATION ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-all disabled:opacity-40"
                style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
                title="First page"
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-all disabled:opacity-40"
                style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
              >‹ Prev</button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.min(Math.max(page - 2, 0), Math.max(totalPages - 5, 0));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="w-9 h-9 rounded-lg text-sm font-bold border-2 transition-all"
                    style={{
                      background:  p === page ? "#1B3A6B" : "white",
                      color:       p === page ? "white"   : "#1B3A6B",
                      borderColor: p === page ? "#1B3A6B" : "#D1D5DB",
                    }}
                  >{p + 1}</button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-all disabled:opacity-40"
                style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
              >Next ›</button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-all disabled:opacity-40"
                style={{ borderColor: "#D1D5DB", color: "#1B3A6B" }}
                title="Last page"
              >»</button>

              <span className="text-xs text-gray-500 ml-2">
                Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} results
              </span>
            </div>
          )}
        </>
      )}

      {/* ── DELETE MODAL BACKDROP ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDeleteConfirm(null)} />
      )}
    </div>
  );
}
