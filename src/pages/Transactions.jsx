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
  if (n.includes("POLISH") || n.includes("ERW")) return "Polish ERW";
  if (n.includes("NON POLISH") || n.includes("NON-POLISH") || n.includes("NONPOLISH")) return "Non-Polish";
  if (n.includes("GI") || n.includes("GALVAN")) return "GI";
  if (n.includes("NB")) return "NB";
  if (n.includes("SHEET") || n.includes("PLATE")) return "Sheet/Plate";
  if (n.includes("VALVE")) return "Valve";
  if (n.includes("FITTING") || n.includes("FLANGE") || n.includes("ELBOW") || n.includes("TEE")) return "Fitting";
  return "Other";
}

const MATERIAL_ORDER = ["SS 304","SS 304L","SS 316","SS 316L","SS 202","SS 201","SS 310","SS 321","SS 409","SS 430","MS","GI","Carbon Steel","Other"];
const CATEGORY_ORDER = ["Seamless","SCH 160","SCH 80","SCH 40","Polish ERW","Non-Polish","GI","NB","Sheet/Plate","Valve","Fitting","Other"];

function buildOrderedProductList(products) {
  const groups = {};
  for (const p of products) {
    const mat = inferMaterial(p.product_name ?? "");
    const cat = inferCategory(p.product_name ?? "");
    const key = `${mat}||${cat}`;
    if (!groups[key]) groups[key] = { mat, cat, items: [] };
    groups[key].items.push(p);
  }
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ga = groups[a], gb = groups[b];
    const mi = MATERIAL_ORDER.indexOf(ga.mat) - MATERIAL_ORDER.indexOf(gb.mat);
    if (mi !== 0) return mi;
    return CATEGORY_ORDER.indexOf(ga.cat) - CATEGORY_ORDER.indexOf(gb.cat);
  });
  const result = [];
  for (const key of sortedKeys) {
    const g = groups[key];
    result.push({ type: "header", label: `${g.mat} — ${g.cat}`, key });
    for (const item of g.items.sort((a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? ""))) {
      result.push({ type: "item", ...item });
    }
  }
  return result;
}

// ── ProductPicker ─────────────────────────────────────────────────────────────

function ProductPicker({ products, value, onChange }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = products.find(p => p.id === value);

  const filtered = query.trim()
    ? products.filter(p =>
        (p.product_id   ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (p.product_name ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : products;

  const ordered = buildOrderedProductList(filtered);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "8px 12px",
          cursor: "pointer", background: "#fff", fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          minHeight: 38,
        }}
      >
        <span style={{ color: selected ? "#111827" : "#9CA3AF" }}>
          {selected ? `${selected.product_id ?? ""} — ${selected.product_name}` : "Select product…"}
        </span>
        <span style={{ color: "#9CA3AF", fontSize: 10 }}>▼</span>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999,
          background: "#fff", border: "1.5px solid #D1D5DB", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 320, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #F3F4F6" }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by ID or name…"
              style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 6, padding: "5px 10px", fontSize: 12, outline: "none" }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {ordered.length === 0 && (
              <div style={{ padding: "16px", textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>No products found</div>
            )}
            {ordered.map((row, i) => {
              if (row.type === "header") return (
                <div key={`h-${i}`} style={{
                  padding: "5px 12px 3px", fontSize: 10, fontWeight: 700,
                  color: "#6B7280", background: "#F8F9FA", textTransform: "uppercase", letterSpacing: "0.05em",
                  borderTop: i > 0 ? "1px solid #F3F4F6" : "none",
                }}>{row.label}</div>
              );
              const active = row.id === value;
              return (
                <div key={row.id}
                  onClick={() => { onChange(row.id); setOpen(false); setQuery(""); }}
                  style={{
                    padding: "7px 14px", fontSize: 12, cursor: "pointer",
                    background: active ? "#EBF0FA" : "transparent",
                    color: active ? "#1B3A6B" : "#111827",
                    fontWeight: active ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F3F4F6"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: "#6B7280", marginRight: 6, fontFamily: "monospace", fontSize: 11 }}>{row.product_id ?? ""}</span>
                  {row.product_name}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ transaction, onConfirm, onCancel }) {
  if (!transaction) return null;
  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000 }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 14, padding: "28px 32px", zIndex: 1001,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: 360, maxWidth: "90vw",
      }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🗑️</div>
        <h3 style={{ margin: "0 0 8px", textAlign: "center", color: "#111827", fontSize: 17, fontWeight: 700 }}>
          Delete Transaction?
        </h3>
        <p style={{ margin: "0 0 20px", textAlign: "center", color: "#6B7280", fontSize: 13, lineHeight: 1.5 }}>
          This will permanently remove the transaction record. This action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1.5px solid #D1D5DB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >Delete</button>
        </div>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Transactions({ user }) {
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");

  // data
  const [transactions, setTransactions] = useState([]);
  const [products,     setProducts]     = useState([]);
  const [locations,    setLocations]    = useState([]);
  const [typeCounts,   setTypeCounts]   = useState({ inward: 0, outward: 0, transfer: 0 });

  // UI state
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page,        setPage]        = useState(0);
  const PAGE_SIZE = 50;

  // filters
  const [filterType,     setFilterType]     = useState("");
  const [filterProduct,  setFilterProduct]  = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [search,         setSearch]         = useState("");

  // form
  const [form, setForm] = useState({
    product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "", notes: "",
  });

  // ── fetch helpers ──────────────────────────────────────────────────────────

  const fetchDropdowns = useCallback(async () => {
    const [{ data: prods }, { data: locs }] = await Promise.all([
      supabase.from("products").select("*").order("product_name"),
      supabase.from("locations").select("*").order("name"),
    ]);
    setProducts(prods ?? []);
    setLocations(locs ?? []);
  }, []);

  const fetchTypeCounts = useCallback(async () => {
    const types = ["inward", "outward", "transfer"];
    const counts = {};
    await Promise.all(types.map(async (t) => {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("transaction_type", t);
      counts[t] = count ?? 0;
    }));
    setTypeCounts(counts);
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("transactions")
        .select("*, products(product_name, product_id), locations(name)")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterType)     q = q.eq("transaction_type", filterType);
      if (filterProduct)  q = q.eq("product_id", filterProduct);
      if (filterLocation) q = q.eq("location_id", filterLocation);
      if (filterDateFrom) q = q.gte("created_at", filterDateFrom);
      if (filterDateTo)   q = q.lte("created_at", filterDateTo + "T23:59:59");
      if (search) {
        q = q.or(
          `party.ilike.%${search}%,notes.ilike.%${search}%`
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      setTransactions(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterProduct, filterLocation, filterDateFrom, filterDateTo, search]);

  useEffect(() => {
    fetchDropdowns();
    fetchTypeCounts();
    fetchTransactions();
  }, [fetchDropdowns, fetchTypeCounts, fetchTransactions]);

  // ── save / delete ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.product_id || !form.location_id || !form.quantity) {
      alert("Product, location and quantity are required.");
      return;
    }
    try {
      const payload = {
        product_id:       form.product_id,
        location_id:      form.location_id,
        transaction_type: form.transaction_type,
        quantity:         Number(form.quantity),
        party:            form.party || null,
        notes:            form.notes || null,
        created_by:       user?.email ?? null,
      };
      if (editingId) {
        await supabase.from("transactions").update(payload).eq("id", editingId);
      } else {
        await supabase.from("transactions").insert([payload]);
      }
      setEditingId(null);
      setShowForm(false);
      setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "", notes: "" });
      setPage(0);
      fetchTypeCounts();
      fetchDropdowns();
      fetchTransactions();
    } catch { alert("Failed to save transaction."); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("transactions").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    fetchTypeCounts();
    fetchTransactions();
  };

  const handleEdit = (t) => {
    setForm({
      product_id:       t.product_id,
      location_id:      t.location_id,
      transaction_type: t.transaction_type,
      quantity:         String(t.quantity),
      party:            t.party ?? "",
      notes:            t.notes ?? "",
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "", notes: "" });
  };

  // ── export helpers ─────────────────────────────────────────────────────────

  const exportXLSX = () => {
    const rows = transactions.map(t => ({
      Date:     new Date(t.created_at).toLocaleString("en-IN"),
      Product:  t.products?.product_name ?? t.product_id,
      Location: t.locations?.name ?? t.location_id,
      Type:     t.transaction_type,
      Qty:      t.quantity,
      Party:    t.party ?? "",
      Notes:    t.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "transactions.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Transactions — Nivee Metals", 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Date","Product","Location","Type","Qty","Party","Notes"]],
      body: transactions.map(t => [
        new Date(t.created_at).toLocaleDateString("en-IN"),
        t.products?.product_name ?? t.product_id,
        t.locations?.name ?? t.location_id,
        t.transaction_type,
        t.quantity,
        t.party ?? "",
        t.notes ?? "",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [27,58,107] },
    });
    doc.save("transactions.pdf");
  };

  // ── type badge ─────────────────────────────────────────────────────────────

  const typeBadge = (type) => {
    const styles = {
      inward:   { bg: "#D1FAE5", color: "#065F46", label: "Inward"   },
      outward:  { bg: "#FEE2E2", color: "#991B1B", label: "Outward"  },
      transfer: { bg: "#DBEAFE", color: "#1E40AF", label: "Transfer" },
    };
    const s = styles[type] ?? { bg: "#F3F4F6", color: "#374151", label: type };
    return (
      <span style={{
        background: s.bg, color: s.color,
        borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700,
      }}>{s.label}</span>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //   RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: "#F8F7F4", minHeight: "100vh", padding: "24px 16px" }}>

      <DeleteConfirmModal
        transaction={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Header ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1B3A6B" }}>📋 Transactions</h1>
            <p style={{ margin: "4px 0 0", color: "#6B7280", fontSize: 13 }}>
              All stock movements
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={exportXLSX} style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>⬇ XLSX</button>
            <button onClick={exportPDF}  style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>⬇ PDF</button>
            <button
              onClick={() => {
                const opening = !showForm;
                setShowForm(v => !v);
                setEditingId(null);
                setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "", notes: "" });
                if (opening) fetchDropdowns();
              }}
              style={{ background: showForm ? "#6B7280" : "#E8630A", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
            >
              {showForm ? "✕ Cancel" : "+ Add Transaction"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Type summary chips ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto 16px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          { key: "inward",   label: "Inward",   bg: "#D1FAE5", color: "#065F46" },
          { key: "outward",  label: "Outward",  bg: "#FEE2E2", color: "#991B1B" },
          { key: "transfer", label: "Transfer", bg: "#DBEAFE", color: "#1E40AF" },
        ].map(t => (
          <div key={t.key} style={{ background: t.bg, color: t.color, borderRadius: 10, padding: "6px 16px", fontSize: 13, fontWeight: 600 }}>
            {t.label}: {typeCounts[t.key] ?? 0}
          </div>
        ))}
      </div>

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div style={{ maxWidth: 1200, margin: "0 auto 20px" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", border: "1.5px solid #E5E7EB" }}>
            <h3 style={{ margin: "0 0 16px", color: "#1B3A6B", fontSize: 16, fontWeight: 700 }}>
              {editingId ? "✏️ Edit Transaction" : "➕ Add Transaction"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>

              {/* Product picker */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Product *</label>
                <ProductPicker
                  products={products}
                  value={form.product_id}
                  onChange={id => setForm(f => ({ ...f, product_id: id }))}
                />
              </div>

              {/* Location */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Location *</label>
                <select
                  value={form.location_id}
                  onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none" }}
                >
                  <option value="">Select location…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              {/* Type */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Type *</label>
                <select
                  value={form.transaction_type}
                  onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none" }}
                >
                  <option value="inward">Inward</option>
                  <option value="outward">Outward</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Quantity *</label>
                <input
                  type="number" min="0"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none" }}
                  placeholder="0"
                />
              </div>

              {/* Party */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Party</label>
                <input
                  value={form.party}
                  onChange={e => setForm(f => ({ ...f, party: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none" }}
                  placeholder="Supplier / Customer name"
                />
              </div>

              {/* Notes */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Notes</label>
                <input
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none" }}
                  placeholder="Optional remarks"
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                onClick={handleSave}
                style={{ background: "#1B3A6B", color: "#fff", border: "none", borderRadius: 8, padding: "9px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >{editingId ? "Update" : "Save Transaction"}</button>
              <button
                onClick={handleCancelForm}
                style={{ background: "#fff", color: "#374151", border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "9px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto 16px", background: "#fff", borderRadius: 10, padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>SEARCH</label>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Party, notes…"
              style={{ border: "1.5px solid #D1D5DB", borderRadius: 7, padding: "6px 10px", fontSize: 12, outline: "none", width: 160 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>TYPE</label>
            <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0); }}
              style={{ border: "1.5px solid #D1D5DB", borderRadius: 7, padding: "6px 10px", fontSize: 12, outline: "none" }}>
              <option value="">All types</option>
              <option value="inward">Inward</option>
              <option value="outward">Outward</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>LOCATION</label>
            <select value={filterLocation} onChange={e => { setFilterLocation(e.target.value); setPage(0); }}
              style={{ border: "1.5px solid #D1D5DB", borderRadius: 7, padding: "6px 10px", fontSize: 12, outline: "none" }}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>FROM</label>
            <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(0); }}
              style={{ border: "1.5px solid #D1D5DB", borderRadius: 7, padding: "6px 10px", fontSize: 12, outline: "none" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>TO</label>
            <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(0); }}
              style={{ border: "1.5px solid #D1D5DB", borderRadius: 7, padding: "6px 10px", fontSize: 12, outline: "none" }} />
          </div>
          <button
            onClick={() => { setSearch(""); setFilterType(""); setFilterProduct(""); setFilterLocation(""); setFilterDateFrom(""); setFilterDateTo(""); setPage(0); }}
            style={{ background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >✕ Clear</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>No transactions found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F1F5F9" }}>
                {["Date","Product","Location","Type","Qty","Party","Notes", isAdmin ? "Actions" : ""].filter(Boolean).map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151", borderBottom: "1.5px solid #E5E7EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, idx) => (
                <tr key={t.id}
                  style={{ background: idx % 2 === 0 ? "#fff" : "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#EFF6FF"}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#FAFAFA"}
                >
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
                    {new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                      {new Date(t.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 13, maxWidth: 240 }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{t.products?.product_name ?? "—"}</div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{t.products?.product_id ?? t.product_id}</div>
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#374151" }}>{t.locations?.name ?? t.location_id}</td>
                  <td style={{ padding: "9px 14px" }}>{typeBadge(t.transaction_type)}</td>
                  <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 700, color: t.transaction_type === "inward" ? "#065F46" : t.transaction_type === "outward" ? "#991B1B" : "#1E40AF" }}>
                    {t.transaction_type === "inward" ? "+" : t.transaction_type === "outward" ? "-" : "⇄"}{t.quantity}
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#374151" }}>{t.party ?? "—"}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#6B7280", maxWidth: 200 }}>{t.notes ?? "—"}</td>
                  {isAdmin && (
                    <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => handleEdit(t)}
                        style={{ background: "#EBF0FA", color: "#1B3A6B", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600, marginRight: 6 }}
                      >✏️ Edit</button>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        style={{ background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                      >🗑️ Del</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      <div style={{ maxWidth: 1200, margin: "12px auto 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          Page {page + 1} · Showing {transactions.length} records
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{ background: page === 0 ? "#F3F4F6" : "#1B3A6B", color: page === 0 ? "#9CA3AF" : "#fff", border: "none", borderRadius: 7, padding: "6px 16px", fontSize: 12, cursor: page === 0 ? "default" : "pointer" }}
          >← Prev</button>
          <button
            disabled={transactions.length < PAGE_SIZE}
            onClick={() => setPage(p => p + 1)}
            style={{ background: transactions.length < PAGE_SIZE ? "#F3F4F6" : "#1B3A6B", color: transactions.length < PAGE_SIZE ? "#9CA3AF" : "#fff", border: "none", borderRadius: 7, padding: "6px 16px", fontSize: 12, cursor: transactions.length < PAGE_SIZE ? "default" : "pointer" }}
          >Next →</button>
        </div>
      </div>

    </div>
  );
}
