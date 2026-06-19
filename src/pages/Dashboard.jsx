import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

/* ─────────────────────────────────────────────────────────────────────────────
   CATEGORY CONFIG — mirrors Products.jsx exactly so pie chart matches
   ───────────────────────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { key: "seamless",  label: "Seamless Pipes",       color: "#1B3A6B", prefixes: ["NM-NBSMLS","NM-SMLS"] },
  { key: "polish",    label: "Polish Pipes (ERW)",    color: "#E8630A", prefixes: ["NM-PP"] },
  { key: "nb",        label: "NB / GI Pipes",        color: "#0D7A5F", prefixes: ["NM-NB"] },
  { key: "nonpolish", label: "Non-Polish Pipes",     color: "#7C3AED", prefixes: ["NM-NMPR","NM-NPS","NM-NPR"] },
  { key: "sheets",    label: "Sheets / Plates",      color: "#B45309", prefixes: ["NM-SH","NM-SNO"] },
  { key: "valves",    label: "Valves",               color: "#0369A1", prefixes: ["NM-VLV","NM-VALVE"] },
  { key: "fittings",  label: "Fittings & Flanges",   color: "#BE185D", prefixes: ["NM-FIT","NM-FLG","NM-FLNG","NM-ELB","NM-TEE","NM-RED","NM-CAP","NM-CPL"] },
  { key: "other",     label: "Others",               color: "#374151", prefixes: [] },
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
  const pnameU = pname.toUpperCase();
  if (pnameU.includes("SHEET") || pnameU.includes("PLATE")) return CATEGORIES.find(c => c.key === "sheets");
  return CATEGORIES[CATEGORIES.length - 1];
}

function safeStock(v) {
  const n = Number(v) || 0;
  return Object.is(n, -0) ? 0 : n;
}

/* ─── Load ALL transactions and build stockMap[productUUID][locationId] ─────
   This is identical to Products.jsx loadStockFromTransactions() so numbers
   will always match exactly.                                                 */
async function loadLiveStockMap() {
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
      if (transaction_type === "inward")  map[product_id][location_id] += q;
      else if (transaction_type === "outward") map[product_id][location_id] -= q;
    });
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return map;
}

/* Total stock for a product across all locations */
function totalForProduct(stockMap, uuid) {
  return safeStock(Object.values(stockMap[uuid] || {}).reduce((s, v) => s + v, 0));
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStock: 0,
    lowAlerts: 0,
    highAlerts: 0,
    pieData: [],
    activityData: [],
    lowAlertProducts: [],
    highAlertProducts: [],
    categoryProductsMap: {},
    heroProducts: [],
    deadStockProducts: []
  });

  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [deadDays, setDeadDays] = useState(30);

  const [question, setQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  // ── Ledger state ─────────────────────────────────────────────────────────────
  const [ledgerProduct, setLedgerProduct] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [ledgerStockMap, setLedgerStockMap] = useState({});

  useEffect(() => { fetchDashboardData(); loadLocations(); }, []);
  useEffect(() => { fetchDashboardData(); }, [deadDays]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchDashboardData();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [deadDays]);

  const loadLocations = async () => {
    const { data } = await supabase.from("locations").select("*");
    setLocations(data || []);
  };

  // ── Stock by location for ledger modal (uses live stockMap) ──────────────────
  const stockByLocation = (productId, locationName) => {
    const loc = locations.find(l => l.name?.toLowerCase() === locationName.toLowerCase());
    if (!loc) return 0;
    return safeStock(ledgerStockMap[productId]?.[loc.id]);
  };

  const totalStockForProduct = (productId) =>
    totalForProduct(ledgerStockMap, productId);

  // ── Open ledger modal ────────────────────────────────────────────────────────
  const openLedger = async (product) => {
    setLedgerProduct(product);
    setLedger([]);
    setLedgerLoading(true);
    try {
      const [{ data: productTrans, error }, freshMap] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, locations(name)")
          .eq("product_id", product.id)
          .order("created_at", { ascending: true }),
        loadLiveStockMap(),
      ]);
      if (error) throw error;
      setLedgerStockMap(freshMap);

      let balance = 0;
      const calculated = (productTrans || []).map(t => {
        if (t.transaction_type === "inward") balance += Number(t.quantity);
        else balance -= Number(t.quantity);
        return { ...t, location_name: t.locations?.name || "", balance: safeStock(balance) };
      });
      setLedger(calculated);
    } catch (err) {
      console.error("Failed to load ledger:", err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  // ── Main dashboard fetch ─────────────────────────────────────────────────────
  const fetchDashboardData = async () => {
    try {
      // 1. Products master list
      const { data: productsData } = await supabase
        .from("products")
        .select("id, product_id, product_name, low_stock_alert, high_stock_alert");

      // 2. Live stock map — built from raw transactions, identical to Products.jsx
      const stockMap = await loadLiveStockMap();

      // 3. Recent 5 transactions
      const { data: recentTrans } = await supabase
        .from("transactions")
        .select("*, products(product_name, product_id), locations(name)")
        .order("created_at", { ascending: false })
        .limit(5);

      // 4. All outward transactions (hero products)
      const { data: outwardData } = await supabase
        .from("transactions")
        .select("product_id, quantity")
        .eq("transaction_type", "outward");

      const outwardMap = {};
      (outwardData || []).forEach(t => {
        outwardMap[t.product_id] = (outwardMap[t.product_id] || 0) + Number(t.quantity);
      });

      // 5. Dead stock — products with no outward in last N days
      const deadCutoff = new Date();
      deadCutoff.setUTCDate(deadCutoff.getUTCDate() - deadDays);
      deadCutoff.setUTCHours(0, 0, 0, 0);

      const { data: recentOutward } = await supabase
        .from("transactions")
        .select("product_id")
        .eq("transaction_type", "outward")
        .gte("created_at", deadCutoff.toISOString());

      const activeProductIds = new Set((recentOutward || []).map(t => t.product_id));

      // ── Compute per-product totals ──────────────────────────────────────────
      // totalForProduct() reads from stockMap (live transactions) — same as Products.jsx totalStock()
      let grandTotal = 0;

      const catTotals = {};
      const categoryProductsMap = {};
      CATEGORIES.forEach(c => { catTotals[c.key] = 0; categoryProductsMap[c.key] = []; });

      (productsData || []).forEach(p => {
        const stock = totalForProduct(stockMap, p.id);
        grandTotal += stock;

        const cat = getCategory(p.product_id, p.product_name);
        catTotals[cat.key] += stock;
        categoryProductsMap[cat.key].push({
          id: p.id,
          product_id:   p.product_id   || "",
          product_name: p.product_name || "",
          currentStock: stock,
        });
      });

      // Sort products within each category
      Object.keys(categoryProductsMap).forEach(key => {
        categoryProductsMap[key].sort((a, b) => a.product_id.localeCompare(b.product_id));
      });

      // Pie data — use category label for display, only include categories with stock > 0
      const pieData = CATEGORIES
        .filter(c => catTotals[c.key] > 0)
        .map(c => ({ name: c.label, value: catTotals[c.key], color: c.color, key: c.key }));

      // ── Last 7 days activity bar chart ──────────────────────────────────────
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }));
      }
      const cutoffUTC = new Date();
      cutoffUTC.setUTCDate(cutoffUTC.getUTCDate() - 6);
      cutoffUTC.setUTCHours(0, 0, 0, 0);
      const { data: recentActivity } = await supabase
        .from("transactions")
        .select("transaction_type, quantity, created_at")
        .gte("created_at", cutoffUTC.toISOString())
        .order("created_at", { ascending: true });

      const dailyMap = {};
      last7Days.forEach(label => { dailyMap[label] = { name: label, inward: 0, outward: 0 }; });
      (recentActivity || []).forEach(t => {
        if (!t.created_at) return;
        const label = new Date(t.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
        if (dailyMap[label]) {
          if (t.transaction_type === "inward")  dailyMap[label].inward  += Number(t.quantity);
          else                                   dailyMap[label].outward += Number(t.quantity);
        }
      });
      const activityData = last7Days.map(label => dailyMap[label]);

      // ── Low / High alerts ───────────────────────────────────────────────────
      // Uses <= threshold, matching Products.jsx: totalStock(p.id) <= Number(p.low_stock_alert)
      const lowList  = [];
      const highList = [];
      (productsData || []).forEach(p => {
        const currentStock = totalForProduct(stockMap, p.id);
        if (p.low_stock_alert  > 0 && currentStock <= Number(p.low_stock_alert))  lowList.push({ ...p, currentStock });
        if (p.high_stock_alert > 0 && currentStock >= Number(p.high_stock_alert)) highList.push({ ...p, currentStock });
      });

      // ── Hero products: top 10 by total outward ──────────────────────────────
      const heroProducts = (productsData || [])
        .map(p => ({ ...p, totalOutward: outwardMap[p.id] || 0, currentStock: totalForProduct(stockMap, p.id) }))
        .filter(p => p.totalOutward > 0)
        .sort((a, b) => b.totalOutward - a.totalOutward)
        .slice(0, 10);

      // ── Dead stock ──────────────────────────────────────────────────────────
      const deadStockProducts = (productsData || [])
        .map(p => ({ ...p, currentStock: totalForProduct(stockMap, p.id) }))
        .filter(p => p.currentStock > 0 && !activeProductIds.has(p.id))
        .sort((a, b) => b.currentStock - a.currentStock);

      setStats({
        totalProducts: productsData?.length || 0,
        totalStock: grandTotal,
        lowAlerts:  lowList.length,
        highAlerts: highList.length,
        recentTransactions: recentTrans || [],
        activityData,
        pieData,
        categoryProductsMap,
        lowAlertProducts:  lowList,
        highAlertProducts: highList,
        heroProducts,
        deadStockProducts,
      });
    } catch (err) {
      console.error("Dashboard error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const askGemini = async () => {
    if (!question) return;
    setIsAsking(true);
    setAiResponse("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setAiResponse(data.answer || "Error: AI could not generate a response.");
    } catch {
      setAiResponse("Error: Could not reach the AI Assistant.");
    } finally {
      setIsAsking(false);
    }
  };

  const exportAiData = (format) => {
    if (!aiResponse) return alert("No data to export!");
    const lines = aiResponse.split("\n")
      .filter(l => l.includes("|") || l.includes(",") || l.includes("\t"))
      .map(line => line.split(/[|,\t]/).map(cell => cell.trim()).filter(cell => cell !== ""));
    if (lines.length === 0) return alert("Try asking for a 'Table report'.");
    if (format === "excel") {
      const ws = XLSX.utils.aoa_to_sheet(lines);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AI_Report");
      XLSX.writeFile(wb, `Nivee_AI_Report_${Date.now()}.xlsx`);
    } else if (format === "pdf") {
      const doc = new jsPDF();
      doc.text("AI Analysis Report", 14, 15);
      doc.autoTable({ head: [lines[0]], body: lines.slice(1), startY: 20, theme: "grid" });
      doc.save(`Nivee_AI_Report_${Date.now()}.pdf`);
    }
  };

  // ── Custom pie label ──────────────────────────────────────────────────────────
  const renderPieLabel = ({ cx, cy, midAngle, outerRadius, name, percent }) => {
    if (percent < 0.04) return null;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 28;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#374151" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fontWeight={600}>
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (loading) return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh" }} className="flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500">
        <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span className="font-semibold text-sm">Loading Dashboard…</span>
      </div>
    </div>
  );

  const selectedCategoryObj = selectedCategory
    ? CATEGORIES.find(c => c.label === selectedCategory || c.key === selectedCategory)
    : null;
  const categoryProducts = selectedCategoryObj
    ? (stats.categoryProductsMap[selectedCategoryObj.key] || [])
    : [];
  const categoryColor = selectedCategoryObj?.color || "#8B5CF6";

  return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh" }} className="p-4 md:p-6 max-w-screen-xl mx-auto">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div style={{ background: "#1B3A6B", borderRadius: 10 }} className="w-9 h-9 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          <h1 style={{ color: "#1B3A6B" }} className="text-2xl font-black tracking-tight">Warehouse Intelligence</h1>
        </div>
      </div>

      {/* ── AI ASSISTANT ── */}
      <div className="bg-white p-5 rounded-2xl shadow-sm mb-6" style={{ border: "1.5px solid #1B3A6B22" }}>
        <h2 className="text-base font-black mb-3 flex items-center gap-2" style={{ color: "#1B3A6B" }}>✨ Nivee AI Assistant</h2>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && askGemini()}
            placeholder="Ask anything about your stock…"
            className="flex-1 p-2.5 border border-gray-200 rounded-xl outline-none text-sm focus:border-blue-400 transition"
          />
          <button
            onClick={askGemini}
            disabled={isAsking}
            style={{ background: "#1B3A6B" }}
            className="text-white px-5 py-2.5 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-50 text-sm"
          >
            {isAsking ? "Thinking…" : "Analyze"}
          </button>
        </div>
        {aiResponse && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center bg-gray-50 px-4 py-2 rounded-t-xl border-x border-t border-blue-100">
              <span className="text-xs font-bold text-blue-600 uppercase">Analysis Results</span>
              <div className="flex gap-2">
                <button onClick={() => exportAiData("excel")} className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold">📥 Excel</button>
                <button onClick={() => exportAiData("pdf")}   className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold">📄 PDF</button>
              </div>
            </div>
            <div className="p-4 bg-white rounded-b-xl border border-blue-100 text-sm text-gray-700 whitespace-pre-wrap shadow-inner overflow-x-auto">
              {aiResponse}
            </div>
          </div>
        )}
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {/* Products */}
        <div className="bg-white p-5 rounded-2xl shadow-sm" style={{ border: "1.5px solid #1B3A6B22" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: "#1B3A6B" }}>Products</p>
          <p className="text-3xl font-black" style={{ color: "#1B3A6B" }}>{stats.totalProducts}</p>
        </div>
        {/* Total Stock */}
        <div className="bg-white p-5 rounded-2xl shadow-sm" style={{ border: "1.5px solid #0D7A5F22" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-1 text-green-600">Total Stock</p>
          <p className="text-3xl font-black text-green-600">{stats.totalStock.toLocaleString()}</p>
        </div>
        {/* Low Stock */}
        <div onClick={() => setModalType("low")} className="bg-white p-5 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-shadow" style={{ border: "1.5px solid #DC262622" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-1 text-red-500">Low Stock</p>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>
        {/* High Stock */}
        <div onClick={() => setModalType("high")} className="bg-white p-5 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-shadow" style={{ border: "1.5px solid #E8630A22" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: "#E8630A" }}>High Stock</p>
          <p className="text-3xl font-black" style={{ color: "#E8630A" }}>{stats.highAlerts}</p>
        </div>
        {/* Hero Products */}
        <div onClick={() => setModalType("hero")} className="bg-white p-5 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-shadow" style={{ border: "1.5px solid #F59E0B22" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-1 text-yellow-500">Hero Products</p>
          <p className="text-3xl font-black text-yellow-500">{stats.heroProducts.length}</p>
        </div>
        {/* Dead Stock */}
        <div onClick={() => setModalType("dead")} className="bg-white p-5 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-shadow" style={{ border: "1.5px solid #6B728022" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-1 text-gray-400">Dead Stock</p>
          <p className="text-3xl font-black text-gray-500">{stats.deadStockProducts.length}</p>
        </div>
      </div>

      {/* ── CHARTS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Bar Chart */}
        <div className="bg-white p-6 rounded-2xl shadow-sm" style={{ border: "1.5px solid #1B3A6B22" }}>
          <h2 className="text-base font-black uppercase tracking-tight mb-5" style={{ color: "#1B3A6B" }}>Stock Movements (Last 7 Days)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                <Tooltip cursor={{ fill: "#EBF0FA" }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: "16px" }} />
                <Bar dataKey="inward"  fill="#10B981" radius={[4,4,0,0]} name="Inward"  />
                <Bar dataKey="outward" fill="#EF4444" radius={[4,4,0,0]} name="Outward" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white p-6 rounded-2xl shadow-sm" style={{ border: "1.5px solid #1B3A6B22" }}>
          <h2 className="text-base font-black uppercase tracking-tight mb-1" style={{ color: "#1B3A6B" }}>Stock Distribution</h2>
          <p className="text-xs text-gray-400 mb-4">Click any slice to view products</p>
          {stats.pieData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">No stock data available</div>
          ) : (
            <div className="h-72 w-full cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine
                    label={renderPieLabel}
                    onClick={data => setSelectedCategory(data.name)}
                  >
                    {stats.pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        style={{ cursor: "pointer", outline: "none" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value.toLocaleString(), name]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── HERO PRODUCTS STRIP ── */}
      {stats.heroProducts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm mb-6 overflow-hidden" style={{ border: "1.5px solid #F59E0B44" }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(90deg,#F59E0B,#E8630A)" }}>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight">🏆 Hero Products</h2>
              <p className="text-yellow-100 text-xs mt-0.5">Top 10 products by total outward sales · Click any row to view ledger</p>
            </div>
            <button onClick={() => setModalType("hero")} className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#FEF3E2" }}>
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>#</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Product</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Total Outward</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Current Stock</th>
                </tr>
              </thead>
              <tbody>
                {stats.heroProducts.map((p, i) => (
                  <tr key={p.id} onClick={() => openLedger(p)} className="border-t border-gray-50 hover:bg-orange-50/30 cursor-pointer transition-colors group">
                    <td className="px-5 py-3">
                      <span className={`font-black text-sm ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-400" : "text-gray-300"}`}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-sm group-hover:text-orange-600 transition-colors" style={{ color: "#1B3A6B" }}>{p.product_name}</div>
                      <div className="font-mono text-xs text-gray-400">{p.product_id}</div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-black tabular-nums" style={{ color: "#E8630A" }}>{p.totalOutward.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold tabular-nums ${p.currentStock === 0 ? "text-red-500" : p.low_stock_alert > 0 && p.currentStock <= p.low_stock_alert ? "text-orange-500" : "text-green-600"}`}>
                        {p.currentStock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DEAD STOCK ── */}
      <div className="bg-white rounded-2xl shadow-sm mb-6 overflow-hidden" style={{ border: "1.5px solid #6B728022" }}>
        <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ background: "linear-gradient(90deg,#4B5563,#374151)" }}>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-tight">💤 Dead Stock</h2>
            <p className="text-gray-300 text-xs mt-0.5">Products with stock but zero outward in the selected period · Click any row to view ledger</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-300 text-xs font-semibold">No movement in:</span>
            {[15, 30, 60, 90].map(d => (
              <button
                key={d}
                onClick={() => setDeadDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${deadDays === d ? "bg-white text-gray-800" : "bg-white/20 text-white hover:bg-white/30"}`}
              >{d}d</button>
            ))}
          </div>
        </div>

        {stats.deadStockProducts.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-semibold">No dead stock in the last {deadDays} days!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#F3F4F6" }}>
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Product</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Current Stock</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Low Alert</th>
                </tr>
              </thead>
              <tbody>
                {stats.deadStockProducts.map(p => (
                  <tr key={p.id} onClick={() => openLedger(p)} className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors group">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-gray-800 group-hover:text-gray-600 transition-colors">{p.product_name}</div>
                      <div className="font-mono text-xs text-gray-400">{p.product_id}</div>
                    </td>
                    <td className="px-5 py-3 text-right font-black text-gray-700 tabular-nums">{p.currentStock}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums" style={{ color: "#E8630A" }}>{p.low_stock_alert || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── PIE CATEGORY MODAL ── */}
      {selectedCategory && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setSelectedCategory(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: categoryColor }}>
              <div>
                <h2 className="text-lg font-black text-white">{selectedCategory}</h2>
                <p className="text-white/70 text-xs mt-0.5">{categoryProducts.length} products</p>
              </div>
              <button onClick={() => setSelectedCategory(null)} className="text-white/80 hover:text-white text-3xl font-light leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Product ID</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Product Name</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryProducts.map((p, i) => (
                    <tr key={p.id} className={`border-t border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.product_id}</td>
                      <td className="px-5 py-3 font-medium text-gray-800">{p.product_name}</td>
                      <td className="px-5 py-3 text-right font-bold text-gray-700 tabular-nums">{p.currentStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setSelectedCategory(null)} style={{ background: "#1B3A6B" }} className="text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors hover:opacity-90">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ALERT MODALS (low / high) ── */}
      {(modalType === "low" || modalType === "high") && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setModalType(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`px-6 py-4 flex items-center justify-between ${modalType === "low" ? "bg-red-600" : ""}`} style={modalType === "high" ? { background: "#E8630A" } : {}}>
              <div>
                <h2 className="text-lg font-black text-white">{modalType === "low" ? "🔴 Low Stock Alerts" : "🟠 High Stock Alerts"}</h2>
                <p className="text-white/70 text-xs mt-0.5">
                  {(modalType === "low" ? stats.lowAlertProducts : stats.highAlertProducts).length} products
                </p>
              </div>
              <button onClick={() => setModalType(null)} className="text-white/80 hover:text-white text-3xl font-light leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {(modalType === "low" ? stats.lowAlertProducts : stats.highAlertProducts).length === 0 ? (
                <div className="p-10 text-center text-gray-400">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="font-semibold">No {modalType === "low" ? "low" : "high"} stock alerts right now</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Product</th>
                      <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Stock</th>
                      <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Alert Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modalType === "low" ? stats.lowAlertProducts : stats.highAlertProducts).map((p, i) => (
                      <tr key={p.id} className={`border-t border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-800">{p.product_name}</div>
                          <div className="font-mono text-xs text-gray-400">{p.product_id}</div>
                        </td>
                        <td className={`px-5 py-3 text-right font-bold tabular-nums ${modalType === "low" ? "text-red-600" : ""}`} style={modalType === "high" ? { color: "#E8630A" } : {}}>
                          {p.currentStock}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-500 tabular-nums">
                          {modalType === "low" ? p.low_stock_alert : p.high_stock_alert}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setModalType(null)} style={{ background: "#1B3A6B" }} className="text-white font-semibold px-5 py-2 rounded-xl text-sm hover:opacity-90">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HERO / DEAD STOCK LIST MODALS ── */}
      {(modalType === "hero" || modalType === "dead") && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setModalType(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: modalType === "hero" ? "linear-gradient(90deg,#F59E0B,#E8630A)" : "linear-gradient(90deg,#4B5563,#374151)" }}>
              <div>
                <h2 className="text-lg font-black text-white">{modalType === "hero" ? "🏆 All Hero Products" : "💤 All Dead Stock"}</h2>
                <p className="text-white/70 text-xs mt-0.5">
                  {(modalType === "hero" ? stats.heroProducts : stats.deadStockProducts).length} products · Click any row to view ledger
                </p>
              </div>
              <button onClick={() => setModalType(null)} className="text-white/80 hover:text-white text-3xl font-light leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>Product</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase" style={{ color: "#1B3A6B" }}>
                      {modalType === "hero" ? "Total Outward" : "Current Stock"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(modalType === "hero" ? stats.heroProducts : stats.deadStockProducts).map((p, i) => (
                    <tr key={p.id} onClick={() => { setModalType(null); openLedger(p); }} className={`border-t border-gray-50 cursor-pointer hover:bg-blue-50 transition-colors group ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors">{p.product_name}</div>
                        <div className="font-mono text-xs text-gray-400">{p.product_id}</div>
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-gray-700">
                        {modalType === "hero" ? (p.totalOutward || 0).toLocaleString() : p.currentStock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setModalType(null)} style={{ background: "#1B3A6B" }} className="text-white font-semibold px-5 py-2 rounded-xl text-sm hover:opacity-90">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEDGER MODAL ── */}
      {ledgerProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] pt-10 px-4 pb-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col">
            <div className="px-7 py-5 border-b rounded-t-2xl text-white" style={{ background: "linear-gradient(90deg,#1B3A6B,#2a5298)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold leading-tight truncate">{ledgerProduct.product_name}</h2>
                  <p className="text-blue-200 font-mono text-sm mt-1">{ledgerProduct.product_id}</p>
                </div>
                <button onClick={() => setLedgerProduct(null)} className="text-blue-200 hover:text-white text-3xl font-light transition-colors leading-none mt-0.5 shrink-0">✕</button>
              </div>
            </div>

            {/* Stock by location */}
            <div className="px-7 py-4 bg-gray-50 border-b">
              <div className="flex flex-wrap gap-3 items-center">
                {locations.map(loc => (
                  <div key={loc.id} className="flex flex-col items-center bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm min-w-[90px]">
                    <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{loc.name}</span>
                    <span className="text-2xl font-extrabold tabular-nums" style={{ color: "#1B3A6B" }}>{stockByLocation(ledgerProduct.id, loc.name)}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center rounded-xl px-5 py-3 shadow-sm min-w-[90px]" style={{ background: "#1B3A6B" }}>
                  <span className="text-xs text-blue-200 uppercase tracking-wide font-semibold mb-1">Total</span>
                  <span className="text-2xl font-extrabold text-white tabular-nums">{totalStockForProduct(ledgerProduct.id)}</span>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {ledgerLoading ? (
                <div className="p-10 text-center text-gray-400">
                  <div className="text-3xl mb-3">⏳</div>Loading transactions…
                </div>
              ) : ledger.length === 0 ? (
                <div className="p-10 text-center text-gray-400">
                  <div className="text-3xl mb-3">📭</div>No transactions yet for this product.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 border-b shadow-sm">
                    <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "#1B3A6B" }}>
                      <th className="px-5 py-3 font-bold">Date / Time</th>
                      <th className="px-4 py-3 font-bold">Type</th>
                      <th className="px-4 py-3 font-bold">Location</th>
                      <th className="px-4 py-3 text-right font-bold">Qty</th>
                      <th className="px-4 py-3 text-right font-bold">Balance</th>
                      <th className="px-4 py-3 font-bold">Party</th>
                      <th className="px-4 py-3 font-bold">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((t, i) => (
                      <tr key={t.id} className={`border-b hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-5 py-3 text-gray-600 text-sm font-mono whitespace-nowrap">
                          {new Date(t.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.transaction_type === "inward" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {t.transaction_type === "inward" ? "▲ IN" : "▼ OUT"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{t.location_name}</td>
                        <td className={`px-4 py-3 text-right font-bold text-base tabular-nums ${t.transaction_type === "inward" ? "text-green-700" : "text-red-600"}`}>
                          {t.transaction_type === "inward" ? "+" : "-"}{t.quantity}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-base tabular-nums text-gray-800">{t.balance}</td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{t.party || "—"}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{t.created_by_email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-7 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between">
              <span className="text-sm text-gray-400">{ledger.length} transaction{ledger.length !== 1 ? "s" : ""} recorded</span>
              <button onClick={() => setLedgerProduct(null)} style={{ background: "#1B3A6B" }} className="text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm hover:opacity-90">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
