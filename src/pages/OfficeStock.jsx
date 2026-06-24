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
  { key: "other",     label: "Other Items",          icon: "◇", color: "#6B7280", light: "#F3F4F6", prefixes: [] },
];

const OFFICE_LOCATION_IDS = ["office", "OFFICE", "Office"];

export default function OfficeStock({ user }) {
  const [products,     setProducts]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [locations,    setLocations]    = useState([]);
  const [search,       setSearch]       = useState("");
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState("all");
  const [expandedIds,  setExpandedIds]  = useState(new Set());
  const [sortField,    setSortField]    = useState("name");
  const [sortDir,      setSortDir]      = useState("asc");
  const prevExpandedRef = useRef(new Set());

  /* ── load everything ── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      /* products — paginated */
      let allProducts = [], from = 0, PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, product_id, product_name, unit")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        allProducts = allProducts.concat(data ?? []);
        if ((data ?? []).length < PAGE) break;
        from += PAGE;
      }

      /* office location ids */
      const { data: locs } = await supabase.from("locations").select("*");
      const officeLocIds = (locs ?? [])
        .filter(l => OFFICE_LOCATION_IDS.some(k => l.id === k || (l.name ?? "").toLowerCase().includes("office")))
        .map(l => l.id);
      setLocations(locs ?? []);

      /* transactions for office locations — paginated */
      let allTx = [], txFrom = 0;
      while (true) {
        const { data: txData, error: txErr } = await supabase
          .from("transactions")
          .select("id, product_id, location_id, transaction_type, quantity, created_at")
          .in("location_id", officeLocIds.length ? officeLocIds : ["__none__"])
          .range(txFrom, txFrom + PAGE - 1);
        if (txErr) throw txErr;
        allTx = allTx.concat(txData ?? []);
        if ((txData ?? []).length < PAGE) break;
        txFrom += PAGE;
      }

      setProducts(allProducts);
      setTransactions(allTx);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── helpers ── */
  const officeTotal = useCallback((pid) => {
    return transactions
      .filter(t => t.product_id === pid)
      .reduce((sum, t) => {
        const q = Number(t.quantity) || 0;
        return t.transaction_type === "inward" ? sum + q : sum - q;
      }, 0);
  }, [transactions]);

  const toggle = (id) => {
    prevExpandedRef.current = new Set(expandedIds);
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  /* ── filtered + sorted product list ── */
  const filtered = products
    .filter(p => {
      const q = search.toLowerCase();
      return (
        (p.product_id   ?? "").toLowerCase().includes(q) ||
        (p.product_name ?? "").toLowerCase().includes(q)
      );
    })
    .filter(p => search ? true : officeTotal(p.id) !== 0)
    .filter(p => {
      if (activeTab === "all") return true;
      const cat = CATEGORIES.find(c => c.key === activeTab);
      if (!cat) return true;
      if (cat.prefixes.length === 0) {
        return !CATEGORIES.some(c2 =>
          c2.key !== "other" && c2.prefixes.some(pfx => (p.product_id ?? "").startsWith(pfx))
        );
      }
      return cat.prefixes.some(pfx => (p.product_id ?? "").startsWith(pfx));
    })
    .sort((a, b) => {
      let av, bv;
      if (sortField === "name") { av = (a.product_name ?? "").toLowerCase(); bv = (b.product_name ?? "").toLowerCase(); }
      else if (sortField === "id") { av = (a.product_id ?? "").toLowerCase(); bv = (b.product_id ?? "").toLowerCase(); }
      else { av = officeTotal(a.id); bv = officeTotal(b.id); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  /* ── category counts ── */
  const catCount = (cat) => {
    if (cat.key === "all") return products.filter(p => officeTotal(p.id) !== 0).length;
    if (cat.prefixes.length === 0) {
      return products.filter(p =>
        officeTotal(p.id) !== 0 &&
        !CATEGORIES.some(c2 => c2.key !== "other" && c2.prefixes.some(pfx => (p.product_id ?? "").startsWith(pfx)))
      ).length;
    }
    return products.filter(p =>
      officeTotal(p.id) !== 0 &&
      cat.prefixes.some(pfx => (p.product_id ?? "").startsWith(pfx))
    ).length;
  };

  /* ── export ── */
  const exportXLSX = () => {
    const rows = filtered.map(p => ({
      "Product ID":   p.product_id ?? "",
      "Product Name": p.product_name ?? "",
      "Unit":         p.unit ?? "",
      "Office Stock": officeTotal(p.id),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Office Stock");
    XLSX.writeFile(wb, "office_stock.xlsx");
  };

  /* ── ledger for expanded product ── */
  const ledger = (pid) =>
    transactions
      .filter(t => t.product_id === pid)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  /* ── stock badge color ── */
  const badgeStyle = (qty) => {
    if (qty > 0)  return { background: "#D1FAE5", color: "#065F46" };
    if (qty < 0)  return { background: "#FEE2E2", color: "#991B1B" };
    return              { background: "#F3F4F6", color: "#6B7280" };
  };

  const activeCat = CATEGORIES.find(c => c.key === activeTab);

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: "#F8F7F4", minHeight: "100vh", padding: "24px 16px" }}>

      {/* ── Header ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1B3A6B" }}>🏢 Office Stock</h1>
            <p style={{ margin: "4px 0 0", color: "#6B7280", fontSize: 13 }}>
              Live inventory at office location
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search product…"
              style={{ border: "1.5px solid #D1D5DB", borderRadius: 8, padding: "7px 12px", fontSize: 13, outline: "none", width: 200 }}
            />
            <button
              onClick={loadAll}
              style={{ background: "#1B3A6B", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}
            >↺ Refresh</button>
            <button
              onClick={exportXLSX}
              style={{ background: "#E8630A", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}
            >⬇ Export</button>
          </div>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto 18px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[{ key: "all", label: "All", icon: "☰", color: "#1B3A6B", light: "#EBF0FA" }, ...CATEGORIES].map(cat => {
          const count = catCount(cat);
          const active = activeTab === cat.key;
          return (
            <button key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: active ? cat.color : cat.light,
                color:      active ? "#fff"     : cat.color,
                opacity: count === 0 && !active ? 0.45 : 1,
                transition: "all 0.15s",
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span style={{
                background: active ? "rgba(255,255,255,0.25)" : cat.color,
                color: active ? "#fff" : "#fff",
                borderRadius: 10, padding: "1px 7px", fontSize: 11,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading office stock…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>
            {search ? `No products match "${search}"` : "No stock at office location"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F1F5F9" }}>
                {[
                  { label: "Product ID",   field: "id"    },
                  { label: "Product Name", field: "name"  },
                  { label: "Unit",         field: null    },
                  { label: "Office Stock", field: "stock" },
                  { label: "",             field: null    },
                ].map((col, i) => (
                  <th key={i}
                    onClick={col.field ? () => handleSort(col.field) : undefined}
                    style={{
                      padding: "10px 14px", textAlign: i >= 3 ? "center" : "left",
                      fontSize: 12, fontWeight: 600, color: "#374151",
                      cursor: col.field ? "pointer" : "default",
                      userSelect: "none",
                      borderBottom: "1.5px solid #E5E7EB",
                    }}
                  >
                    {col.label}
                    {col.field && sortField === col.field && (
                      <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const stock   = officeTotal(p.id);
                const isOpen  = expandedIds.has(p.id);
                const rows    = ledger(p.id);
                const cat     = CATEGORIES.find(c => c.prefixes.some(pfx => (p.product_id ?? "").startsWith(pfx))) ?? CATEGORIES[CATEGORIES.length - 1];

                return [
                  <tr key={p.id}
                    style={{
                      background: idx % 2 === 0 ? "#fff" : "#FAFAFA",
                      borderBottom: "1px solid #F3F4F6",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#EFF6FF"}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#FAFAFA"}
                  >
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280", fontFamily: "monospace" }}>
                      <span style={{
                        background: cat.light, color: cat.color,
                        borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 600,
                      }}>{p.product_id ?? "—"}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#111827", fontWeight: 500, maxWidth: 320 }}>
                      {p.product_name ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280", textAlign: "center" }}>
                      {p.unit ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ ...badgeStyle(stock), borderRadius: 8, padding: "3px 14px", fontSize: 13, fontWeight: 700 }}>
                        {stock}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <button
                        onClick={() => toggle(p.id)}
                        style={{
                          background: isOpen ? "#1B3A6B" : "#F1F5F9",
                          color: isOpen ? "#fff" : "#374151",
                          border: "none", borderRadius: 6, padding: "4px 12px",
                          fontSize: 11, cursor: "pointer", fontWeight: 600,
                        }}
                      >{isOpen ? "▲ Hide" : "▼ Ledger"}</button>
                    </td>
                  </tr>,

                  isOpen && (
                    <tr key={`${p.id}-ledger`}>
                      <td colSpan={5} style={{ background: "#F8FAFC", padding: "0 14px 14px 14px" }}>
                        <div style={{ paddingTop: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#1B3A6B", marginBottom: 8 }}>
                            Transaction Ledger — {p.product_name}
                          </div>
                          {rows.length === 0 ? (
                            <div style={{ color: "#9CA3AF", fontSize: 12 }}>No transactions found.</div>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "#E8F0FE" }}>
                                  {["Date", "Type", "Qty", "Running Total"].map(h => (
                                    <th key={h} style={{ padding: "5px 10px", textAlign: "left", color: "#374151", fontWeight: 600 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  let running = 0;
                                  const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                                  const withRunning = sorted.map(t => {
                                    const q = Number(t.quantity) || 0;
                                    running += t.transaction_type === "inward" ? q : -q;
                                    return { ...t, running };
                                  });
                                  return withRunning.reverse().map((t, i) => (
                                    <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#F8FAFC" }}>
                                      <td style={{ padding: "5px 10px", color: "#6B7280" }}>
                                        {new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                      </td>
                                      <td style={{ padding: "5px 10px" }}>
                                        <span style={{
                                          background: t.transaction_type === "inward" ? "#D1FAE5" : "#FEE2E2",
                                          color:      t.transaction_type === "inward" ? "#065F46" : "#991B1B",
                                          borderRadius: 5, padding: "1px 8px", fontWeight: 600,
                                        }}>{t.transaction_type}</span>
                                      </td>
                                      <td style={{ padding: "5px 10px", fontWeight: 600, color: t.transaction_type === "inward" ? "#065F46" : "#991B1B" }}>
                                        {t.transaction_type === "inward" ? "+" : "-"}{t.quantity}
                                      </td>
                                      <td style={{ padding: "5px 10px", fontWeight: 700, color: t.running >= 0 ? "#1B3A6B" : "#991B1B" }}>
                                        {t.running}
                                      </td>
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer count ── */}
      <div style={{ maxWidth: 1100, margin: "12px auto 0", textAlign: "right", color: "#9CA3AF", fontSize: 12 }}>
        Showing {filtered.length} product{filtered.length !== 1 ? "s" : ""}
        {activeTab !== "all" && activeCat ? ` in ${activeCat.label}` : ""}
        {search ? ` matching "${search}"` : ""}
      </div>
    </div>
  );
}