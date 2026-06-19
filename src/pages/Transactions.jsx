import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ADMIN_EMAILS = [
  "niveemetals@gmail.com",
  "vishalom999@gmail.com",
  "vikrambhandari7171@gmail.com",
];

// ─── Catalog ordering helpers (mirrors Products.jsx) ─────────────────────────

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
    const slashIdx = raw.indexOf("/");
    const denomStr = raw.slice(slashIdx + 1);
    const numerStr = raw.slice(slashIdx - 1, slashIdx);
    const wholeStr = raw.slice(0, slashIdx - 1);
    const whole = wholeStr ? parseInt(wholeStr, 10) : 0;
    const numer = parseInt(numerStr, 10);
    const denom = parseInt(denomStr, 10);
    if (!isNaN(whole) && !isNaN(numer) && !isNaN(denom) && denom !== 0) {
      return whole + numer / denom;
    }
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
  "SCH 5", "SCH 10", "SCH 20", "SCH 40", "SCH 80", "SCH 160",
  "Seamless",
  "SWG 20", "SWG 18", "SWG 16", "SWG 14", "SWG 12", "SWG 10",
  "ERW", "Polish Pipe", "Square Rod", "Rectangular Pipe",
  "Round Bar", "Flat Bar", "Angle", "Channel",
  "Sheet / Plate", "Coil / Strip", "Pipe (General)", "General",
];

const MATERIAL_ORDER = [
  "SS 304", "SS 304L", "SS 316", "SS 316L", "SS 202", "SS 201",
  "SS 310", "SS 321", "SS 409", "SS 430", "MS", "GI", "Carbon Steel", "Other"
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
    const ia = MATERIAL_ORDER.indexOf(a);
    const ib = MATERIAL_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const ordered = [];
  materialKeys.forEach(mat => {
    const catKeys = Object.keys(map[mat]).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    catKeys.forEach(cat => {
      const sorted = [...map[mat][cat]].sort((a, b) => {
        const sA = extractSizeKey(a.product_name);
        const sB = extractSizeKey(b.product_name);
        if (sA !== sB) return sA - sB;
        return a.product_id.localeCompare(b.product_id);
      });
      sorted.forEach(p => ordered.push({ ...p, _material: mat, _category: cat }));
    });
  });
  return ordered;
}

// ─── Big Searchable Product Picker (prominent, full-width in form) ────────────

function ProductPicker({ products, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wrapperRef = useRef(null);

  const orderedList = buildOrderedProductList(products);
  const selectedProduct = products.find(p => p.id === value);

  const filtered = query.trim() === ""
    ? orderedList
    : orderedList.filter(p =>
        p.product_name.toLowerCase().includes(query.toLowerCase()) ||
        p.product_id.toLowerCase().includes(query.toLowerCase())
      );

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
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

  const selectProduct = (p) => {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) { setOpen(true); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) selectProduct(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  };

  let lastMat = null, lastCat = null;

  return (
    <div ref={wrapperRef} className="relative col-span-full">
      {/* Big prominent label */}
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
        🔍 Search &amp; Select Product
      </label>
      <div
        className={`flex items-center border-2 rounded-xl bg-white cursor-text transition-all shadow-sm ${
          open
            ? "ring-2 ring-blue-400 border-blue-400 shadow-md"
            : value
            ? "border-blue-300"
            : "border-gray-300 hover:border-blue-300"
        }`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        style={{ minHeight: "52px" }}
      >
        {/* Selected pill */}
        {!open && selectedProduct && query === "" ? (
          <div className="flex items-center flex-1 px-4 gap-3">
            <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4" />
              </svg>
              {selectedProduct.product_name}
            </span>
            <span className="text-xs text-gray-400">Click to change</span>
          </div>
        ) : (
          <div className="flex items-center flex-1 px-4 gap-3">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlighted(0); setOpen(true); }}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              placeholder={selectedProduct ? selectedProduct.product_name : "Type product name or size (e.g. SS 304, 1\" SCH 40)..."}
              className="flex-1 py-3 text-base outline-none bg-transparent placeholder-gray-400 font-medium"
            />
          </div>
        )}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 text-gray-400 hover:text-red-500 transition-colors text-xl leading-none flex-shrink-0"
            title="Clear"
          >
            ×
          </button>
        )}
        <span className="pr-4 text-gray-400 text-sm pointer-events-none flex-shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-2xl overflow-y-auto"
          style={{ maxHeight: "320px" }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-400 text-center">
              <div className="text-2xl mb-2">🔍</div>
              No products found for "{query}"
            </div>
          ) : (
            filtered.map((p, idx) => {
              const showMat = p._material !== lastMat;
              const showCat = showMat || p._category !== lastCat;
              lastMat = p._material;
              lastCat = p._category;
              return (
                <div key={p.id}>
                  {showMat && (
                    <div className="px-4 pt-2 pb-1 text-xs font-black text-white bg-blue-700 uppercase tracking-wider sticky top-0 z-10">
                      {p._material}
                    </div>
                  )}
                  {showCat && (
                    <div className="px-5 py-0.5 text-xs font-semibold text-blue-700 bg-blue-50 border-b border-blue-100">
                      {p._category}
                    </div>
                  )}
                  <div
                    data-idx={idx}
                    onClick={() => selectProduct(p)}
                    className={`px-6 py-2.5 text-sm cursor-pointer transition-colors ${
                      idx === highlighted
                        ? "bg-blue-100 text-blue-900 font-semibold"
                        : "hover:bg-gray-50 text-gray-800"
                    } ${p.id === value ? "font-bold text-blue-700 bg-blue-50" : ""}`}
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Transactions() {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  const [form, setForm] = useState({
    product_id: "",
    location_id: "",
    transaction_type: "inward",
    quantity: "",
    party: "",
  });

  useEffect(() => {
    checkUserRole();
    fetchDropdowns();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [page]);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (ADMIN_EMAILS.includes(user?.email)) setIsAdmin(true);
  };

  async function fetchDropdowns() {
    const { data: prod } = await supabase.from("products").select("*");
    const { data: loc } = await supabase.from("locations").select("*");
    setProducts(prod || []);
    setLocations(loc || []);
  }

  async function fetchTransactions() {
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
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
    }
  }

  const formatIST = (dbDateString) => {
    if (!dbDateString) return "-";
    const date = new Date(dbDateString);
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleSave = async () => {
    if (!form.product_id || !form.location_id || !form.quantity) {
      alert("Please fill required fields: Product, Location, Quantity");
      return;
    }
    try {
      const activeEmployee = localStorage.getItem("userEmail") || "Unknown User";
      const payload = {
        product_id: form.product_id,
        location_id: form.location_id,
        transaction_type: form.transaction_type,
        quantity: Number(form.quantity),
        party: form.party,
        created_by_email: activeEmployee,
      };
      if (editingId) {
        await supabase.from("transactions").update(payload).eq("id", editingId);
      } else {
        await supabase.from("transactions").insert([payload]);
      }
      setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "" });
      setEditingId(null);
      setShowForm(false);
      setPage(0);
      fetchTransactions();
    } catch (err) {
      alert("Failed to save transaction.");
    }
  };

  const handleEditClick = (t) => {
    setForm({
      product_id: t.product_id,
      location_id: t.location_id,
      transaction_type: t.transaction_type,
      quantity: t.quantity,
      party: t.party || "",
    });
    setEditingId(t.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return alert("Admin only delete access.");
    if (!window.confirm("Delete this transaction?")) return;
    await supabase.from("transactions").delete().eq("id", id);
    fetchTransactions();
  };

  const exportToExcel = async () => {
    try {
      const { data: allTrans } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });
      const exportData = (allTrans || []).map((t) => ({
        Date_IST: formatIST(t.created_at),
        Product: products.find((p) => p.id === t.product_id)?.product_name || "",
        Type: t.transaction_type.toUpperCase(),
        Quantity: t.quantity,
        Location: locations.find((l) => l.id === t.location_id)?.name || "",
        Party: t.party || "-",
        Employee: t.created_by_email || "System",
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      XLSX.writeFile(wb, "Nivee_Metal_Transactions.xlsx");
    } catch (err) {
      alert("Export failed.");
    }
  };

  const exportToPDF = async () => {
    try {
      const { data: allTrans, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(13);
      doc.setTextColor(10, 42, 94);
      doc.text("Transactions Report \u2014 Nivee Metals", 14, 13);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Generated: " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), 14, 19);
      const head = [["Date (IST)", "Product", "Type", "Qty", "Location", "Party", "Employee"]];
      const body = (allTrans || []).map(t => [
        formatIST(t.created_at),
        products.find(p => p.id === t.product_id)?.product_name || "-",
        t.transaction_type.toUpperCase(),
        String(t.quantity),
        locations.find(l => l.id === t.location_id)?.name || "-",
        t.party || "-",
        t.created_by_email || "System",
      ]);
      autoTable(doc, {
        head,
        body,
        startY: 23,
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 2, overflow: "ellipsize", halign: "left", lineColor: [220, 220, 220], lineWidth: 0.2 },
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 249, 252] },
        columnStyles: {
          0: { cellWidth: 38 }, 1: { cellWidth: 70 }, 2: { cellWidth: 18, halign: "center" },
          3: { cellWidth: 14, halign: "center" }, 4: { cellWidth: 22 }, 5: { cellWidth: 48 }, 6: { cellWidth: 48 },
        },
        margin: { top: 23, left: 14, right: 14 },
      });
      doc.save("Nivee_Metal_Transactions.pdf");
    } catch (err) {
      alert("PDF export failed: " + err.message);
    }
  };

  // Filter logic
  const filtered = transactions.filter((t) => {
    const product = products.find((p) => p.id === t.product_id);
    const matchSearch = !search || product?.product_name?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || t.transaction_type === filterType;
    const matchLoc = filterLocation === "all" || t.location_id === filterLocation;
    return matchSearch && matchType && matchLoc;
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Stats for summary pills
  const inwardCount = transactions.filter(t => t.transaction_type === "inward").length;
  const outwardCount = transactions.filter(t => t.transaction_type === "outward").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-8">

        {/* ── PAGE HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Transactions</h1>
            <p className="text-gray-500 text-sm mt-1 font-medium">
              {totalCount.toLocaleString()} total entries
              <span className="mx-2 text-gray-300">·</span>
              <span className="text-green-600 font-bold">{inwardCount} IN</span>
              <span className="mx-1 text-gray-300">·</span>
              <span className="text-red-500 font-bold">{outwardCount} OUT</span>
              <span className="text-gray-400 text-xs ml-1">(this page)</span>
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Excel
            </button>
            <button
              onClick={exportToPDF}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF
            </button>
            <button
              onClick={() => { setShowForm(f => !f); if (editingId) cancelEdit(); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold shadow-sm transition-all text-sm ${
                showForm
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {showForm ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Close Form
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  New Transaction
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── TRANSACTION FORM ── */}
        {(showForm || editingId) && (
          <div className={`mb-6 bg-white rounded-2xl shadow-md border-2 overflow-hidden transition-all ${
            editingId ? "border-orange-400" : "border-blue-200"
          }`}>
            {/* Form header */}
            <div className={`px-6 py-4 flex items-center justify-between ${
              editingId ? "bg-orange-50 border-b border-orange-200" : "bg-blue-50 border-b border-blue-100"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  editingId ? "bg-orange-500" : "bg-blue-600"
                }`}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={editingId ? "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" : "M12 4v16m8-8H4"} />
                  </svg>
                </div>
                <div>
                  <h2 className={`font-black text-base ${editingId ? "text-orange-800" : "text-blue-800"}`}>
                    {editingId ? "Edit Transaction" : "Record New Transaction"}
                  </h2>
                  <p className={`text-xs font-medium ${editingId ? "text-orange-500" : "text-blue-400"}`}>
                    {editingId ? "Modifying existing entry" : "Fill in the details below to record a movement"}
                  </p>
                </div>
              </div>
              <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form body */}
            <div className="p-6 space-y-5">
              {/* Big Product Picker — full width */}
              <ProductPicker
                products={products}
                value={form.product_id}
                onChange={(id) => setForm({ ...form, product_id: id })}
              />

              {/* Second row: Location, Type, Qty, Party */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Location */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    📍 Location
                  </label>
                  <select
                    value={form.location_id}
                    onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  >
                    <option value="">Select Location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    ↕ Type
                  </label>
                  <div className="flex rounded-xl overflow-hidden border-2 border-gray-200">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, transaction_type: "inward" })}
                      className={`flex-1 py-2.5 text-sm font-black transition-all ${
                        form.transaction_type === "inward"
                          ? "bg-green-600 text-white"
                          : "bg-white text-gray-500 hover:bg-green-50"
                      }`}
                    >
                      ↑ IN
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, transaction_type: "outward" })}
                      className={`flex-1 py-2.5 text-sm font-black transition-all ${
                        form.transaction_type === "outward"
                          ? "bg-red-600 text-white"
                          : "bg-white text-gray-500 hover:bg-red-50"
                      }`}
                    >
                      ↓ OUT
                    </button>
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    # Quantity
                  </label>
                  <input
                    type="number"
                    placeholder="Enter qty"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                {/* Party */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    🏢 Party Name
                  </label>
                  <input
                    type="text"
                    placeholder="Supplier / Customer"
                    value={form.party}
                    onChange={(e) => setForm({ ...form, party: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSave}
                  className={`flex items-center gap-2 px-8 py-3 rounded-xl font-black text-white shadow-sm transition-all ${
                    editingId
                      ? "bg-orange-500 hover:bg-orange-600"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {editingId ? "Update Entry" : "Save Entry"}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-6 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SEARCH + FILTERS BAR ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-5 flex flex-col md:flex-row gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Filter by product name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            )}
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all min-w-[130px]"
          >
            <option value="all">All Types</option>
            <option value="inward">Inward Only</option>
            <option value="outward">Outward Only</option>
          </select>

          {/* Location Filter */}
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all min-w-[140px]"
          >
            <option value="all">All Locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          {/* Result count */}
          {(search || filterType !== "all" || filterLocation !== "all") && (
            <span className="text-xs font-bold text-gray-400 whitespace-nowrap">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ── TABLE ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Date (IST)</th>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Product</th>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Qty</th>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Location</th>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Party</th>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Employee</th>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-gray-400">
                        <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="font-bold text-gray-400">No transactions found</p>
                        <p className="text-sm text-gray-300">
                          {search ? `No results for "${search}"` : "Record your first transaction above"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => (
                    <tr
                      key={t.id}
                      className={`hover:bg-gray-50 transition-colors group ${editingId === t.id ? "bg-orange-50" : ""}`}
                    >
                      <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap font-medium">
                        {formatIST(t.created_at)}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-gray-800 max-w-xs">
                        <span className="line-clamp-2 leading-snug">
                          {products.find(p => p.id === t.product_id)?.product_name || (
                            <span className="text-gray-300 italic font-normal">Unknown product</span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wide ${
                          t.transaction_type === "inward"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-600"
                        }`}>
                          {t.transaction_type === "inward" ? "↑ IN" : "↓ OUT"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono font-black text-gray-800 text-sm">
                        {t.quantity}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 font-semibold">
                        {locations.find(l => l.id === t.location_id)?.name || (
                          <span className="text-gray-300 italic font-normal">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700 font-semibold max-w-[160px] truncate">
                        {t.party || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {t.created_by_email || "System"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditClick(t)}
                            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="flex items-center gap-1 text-xs font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-all"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── PAGINATION ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-3.5 flex justify-between items-center">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all ${
              page === 0
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Page {page + 1} of {totalPages || 1}
            </span>
            <span className="text-gray-200">·</span>
            <span className="text-xs font-semibold text-gray-400">
              {totalCount.toLocaleString()} total
            </span>
          </div>

          <button
            onClick={() => setPage(page + 1)}
            disabled={page + 1 >= totalPages}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all ${
              page + 1 >= totalPages
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            }`}
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
}
