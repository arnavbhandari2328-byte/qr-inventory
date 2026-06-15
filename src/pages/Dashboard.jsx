import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

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
  const [modalType, setModalType] = useState(null); // 'low' | 'high' | 'hero' | 'dead'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [deadDays, setDeadDays] = useState(30);

  const [question, setQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  const COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#EC4899", "#F97316", "#8B5CF6"];
  const CATEGORY_COLORS = {
    "Seamless Pipe":   "#F59E0B",
    "Polish Pipe":     "#3B82F6",
    "NB Pipe":         "#10B981",
    "Sheets":          "#EC4899",
    "Non-Polish Pipe": "#F97316",
    "Others":          "#8B5CF6"
  };

  useEffect(() => { fetchDashboardData(); }, []);
  useEffect(() => { fetchDashboardData(); }, [deadDays]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchDashboardData();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [deadDays]);

  const fetchDashboardData = async () => {
    try {
      const { data: productsData } = await supabase
        .from("products")
        .select("id, product_id, product_name, low_stock_alert, high_stock_alert");

      const { data: recentTrans } = await supabase
        .from("transactions")
        .select("*, products(product_name, product_id), locations(name)")
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: stockSummaryData } = await supabase
        .from("stock_summary")
        .select("*");

      // ── Hero products: top 10 by total outward quantity (all time) ──────────
      const { data: outwardData } = await supabase
        .from("transactions")
        .select("product_id, quantity")
        .eq("transaction_type", "outward");

      const outwardMap = {};
      (outwardData || []).forEach(t => {
        outwardMap[t.product_id] = (outwardMap[t.product_id] || 0) + Number(t.quantity);
      });

      // ── Dead stock: products with NO outward in last `deadDays` days ────────
      const deadCutoff = new Date();
      deadCutoff.setUTCDate(deadCutoff.getUTCDate() - deadDays);
      deadCutoff.setUTCHours(0, 0, 0, 0);

      const { data: recentOutward } = await supabase
        .from("transactions")
        .select("product_id")
        .eq("transaction_type", "outward")
        .gte("created_at", deadCutoff.toISOString());

      const activeProductIds = new Set((recentOutward || []).map(t => t.product_id));

      // stockMap: { uuid → total stock }
      const stockMap = {};
      (stockSummaryData || []).forEach(row => {
        const qty = row.current_stock ?? row.total_stock ?? 0;
        stockMap[row.product_id] = (stockMap[row.product_id] || 0) + qty;
      });

      const productInfo = {};
      (productsData || []).forEach(p => {
        productInfo[p.id] = { product_id: p.product_id, product_name: p.product_name };
      });

      // Category totals for pie
      let totalStock = 0;
      let polish = 0, seamless = 0, nb = 0, sheets = 0, nonPolish = 0, other = 0;
      const categoryProductsMap = {};

      Object.entries(stockMap).forEach(([uuid, stock]) => {
        totalStock += stock;
        const info = productInfo[uuid] || {};
        const pId = (info.product_id || "").toUpperCase();
        const pName = (info.product_name || "").toUpperCase();
        let cat;
        if (pId.startsWith("NM-PP")) { polish += stock; cat = "Polish Pipe"; }
        else if (pId.startsWith("NM-NBSMLS")) { seamless += stock; cat = "Seamless Pipe"; }
        else if (pId.startsWith("NM-NB")) { nb += stock; cat = "NB Pipe"; }
        else if (pId.startsWith("NM-SH") || pId.startsWith("NM-SNO") || pId.includes("SHEET") || pName.includes("SHEET")) { sheets += stock; cat = "Sheets"; }
        else if (pId.startsWith("NM-NMPR") || pId.startsWith("NM-NPS") || pId.startsWith("NM-NPR")) { nonPolish += stock; cat = "Non-Polish Pipe"; }
        else { other += stock; cat = "Others"; }
        if (!categoryProductsMap[cat]) categoryProductsMap[cat] = [];
        categoryProductsMap[cat].push({ id: uuid, product_id: info.product_id || "", product_name: info.product_name || "", currentStock: stock });
      });

      Object.keys(categoryProductsMap).forEach(cat => {
        categoryProductsMap[cat].sort((a, b) => a.product_id.localeCompare(b.product_id));
      });

      // Last 7 days activity
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
          if (t.transaction_type === "inward") dailyMap[label].inward += Number(t.quantity);
          else dailyMap[label].outward += Number(t.quantity);
        }
      });
      const activityData = last7Days.map(label => dailyMap[label]);

      // Low / High alerts
      const lowList = [], highList = [];
      (productsData || []).forEach(p => {
        const currentStock = stockMap[p.id] || 0;
        if (p.low_stock_alert > 0 && currentStock <= p.low_stock_alert) lowList.push({ ...p, currentStock });
        if (p.high_stock_alert > 0 && currentStock >= p.high_stock_alert) highList.push({ ...p, currentStock });
      });

      // Hero products: top 10 by outward quantity, must have stock > 0
      const heroProducts = (productsData || [])
        .map(p => ({
          ...p,
          totalOutward: outwardMap[p.id] || 0,
          currentStock: stockMap[p.id] || 0
        }))
        .filter(p => p.totalOutward > 0)
        .sort((a, b) => b.totalOutward - a.totalOutward)
        .slice(0, 10);

      // Dead stock: has current stock > 0, but no outward in last N days
      const deadStockProducts = (productsData || [])
        .map(p => ({ ...p, currentStock: stockMap[p.id] || 0 }))
        .filter(p => p.currentStock > 0 && !activeProductIds.has(p.id))
        .sort((a, b) => b.currentStock - a.currentStock);

      setStats({
        totalProducts: productsData?.length || 0,
        totalStock,
        lowAlerts: lowList.length,
        highAlerts: highList.length,
        recentTransactions: recentTrans || [],
        activityData,
        categoryProductsMap,
        pieData: [
          { name: "Seamless Pipe",   value: Math.max(0, seamless) },
          { name: "Polish Pipe",     value: Math.max(0, polish) },
          { name: "NB Pipe",         value: Math.max(0, nb) },
          { name: "Sheets",          value: Math.max(0, sheets) },
          { name: "Non-Polish Pipe", value: Math.max(0, nonPolish) },
          { name: "Others",          value: Math.max(0, other) }
        ].filter(item => item.value > 0),
        lowAlertProducts: lowList,
        highAlertProducts: highList,
        heroProducts,
        deadStockProducts
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
    } catch (err) {
      setAiResponse("Error: Could not reach the AI Assistant.");
    } finally {
      setIsAsking(false);
    }
  };

  const exportAiData = (format) => {
    if (!aiResponse) return alert("No data to export!");
    const lines = aiResponse.split('\n')
      .filter(l => l.includes('|') || l.includes(',') || l.includes('\t'))
      .map(line => line.split(/[|,\t]/).map(cell => cell.trim()).filter(cell => cell !== ""));
    if (lines.length === 0) return alert("Try asking for a 'Table report'.");
    if (format === 'excel') {
      const ws = XLSX.utils.aoa_to_sheet(lines);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AI_Report");
      XLSX.writeFile(wb, `Nivee_AI_Report_${Date.now()}.xlsx`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text("AI Analysis Report", 14, 15);
      doc.autoTable({ head: [lines[0]], body: lines.slice(1), startY: 20, theme: 'grid' });
      doc.save(`Nivee_AI_Report_${Date.now()}.pdf`);
    }
  };

  const formatIST = (dbDateString) => {
    if (!dbDateString) return "-";
    return new Date(dbDateString).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    });
  };

  if (loading) return <div className="p-8 font-bold text-gray-500">Loading Dashboard...</div>;

  const categoryProducts = selectedCategory ? (stats.categoryProductsMap[selectedCategory] || []) : [];
  const categoryColor = selectedCategory ? (CATEGORY_COLORS[selectedCategory] || "#8B5CF6") : "#8B5CF6";

  return (
    <div className="p-6 md:p-8">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Warehouse Intelligence</h1>
      </div>

      {/* AI Assistant */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 mb-8">
        <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center gap-2">✨ Nivee AI Assistant</h2>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your stock..."
            className="flex-1 p-3 border rounded-xl outline-none focus:border-blue-500 transition-all text-sm"
          />
          <button onClick={askGemini} disabled={isAsking} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 text-sm">
            {isAsking ? "Thinking..." : "Analyze"}
          </button>
        </div>
        {aiResponse && (
          <div className="mt-4 space-y-3">
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-t-xl border-x border-t border-blue-100">
              <span className="text-xs font-bold text-blue-600 uppercase">Analysis Results</span>
              <div className="flex gap-2">
                <button onClick={() => exportAiData('excel')} className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold">📥 Excel</button>
                <button onClick={() => exportAiData('pdf')} className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold">📄 PDF</button>
              </div>
            </div>
            <div className="p-4 bg-white rounded-b-xl border border-blue-100 text-sm text-gray-700 whitespace-pre-wrap shadow-inner overflow-x-auto">
              {aiResponse}
            </div>
          </div>
        )}
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Products</p>
          <p className="text-3xl font-black text-blue-600">{stats.totalProducts}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Stock</p>
          <p className="text-3xl font-black text-green-600">{stats.totalStock}</p>
        </div>
        <div onClick={() => setModalType('low')} className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 cursor-pointer hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Low Stock</p>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>
        <div onClick={() => setModalType('high')} className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 cursor-pointer hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-1">High Stock</p>
          <p className="text-3xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
        <div onClick={() => setModalType('hero')} className="bg-white p-5 rounded-2xl shadow-sm border border-yellow-100 cursor-pointer hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-1">Hero Products</p>
          <p className="text-3xl font-black text-yellow-500">{stats.heroProducts.length}</p>
        </div>
        <div onClick={() => setModalType('dead')} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Dead Stock</p>
          <p className="text-3xl font-black text-gray-500">{stats.deadStockProducts.length}</p>
        </div>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-6 uppercase tracking-tight">Stock Movements (Last 7 Days)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                <Tooltip cursor={{ fill: '#f9fafb' }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                <Bar dataKey="inward" fill="#10B981" radius={[4, 4, 0, 0]} name="Inward" />
                <Bar dataKey="outward" fill="#EF4444" radius={[4, 4, 0, 0]} name="Outward" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-1 self-start uppercase tracking-tight">Stock Distribution</h2>
          <p className="text-xs text-gray-400 self-start mb-4">Click any slice to view products</p>
          <div className="h-72 w-full cursor-pointer">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.pieData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90}
                  paddingAngle={4} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  onClick={(data) => setSelectedCategory(data.name)}
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} style={{ cursor: "pointer", outline: "none" }} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, "Items"]} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── HERO PRODUCTS STRIP ─────────────────────────────────────────────── */}
      {stats.heroProducts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-yellow-100 mb-8 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-yellow-400 to-orange-400 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">🏆 Hero Products</h2>
              <p className="text-yellow-100 text-xs mt-0.5">Top 10 products by total outward sales</p>
            </div>
            <button onClick={() => setModalType('hero')} className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-yellow-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">#</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Product</th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">Total Outward</th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">Current Stock</th>
                </tr>
              </thead>
              <tbody>
                {stats.heroProducts.map((p, i) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-yellow-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <span className={`font-black text-sm ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'}`}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-800 text-sm">{p.product_name}</div>
                      <div className="font-mono text-xs text-gray-400">{p.product_id}</div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-black text-orange-500 tabular-nums">{p.totalOutward.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold tabular-nums ${
                        p.currentStock === 0 ? 'text-red-500' :
                        p.low_stock_alert && p.currentStock <= p.low_stock_alert ? 'text-orange-500' :
                        'text-green-600'
                      }`}>{p.currentStock}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DEAD STOCK SECTION ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-8 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-600 to-gray-700 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight">💤 Dead Stock</h2>
            <p className="text-gray-300 text-xs mt-0.5">Products with stock but zero outward in the selected period</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-300 text-xs font-semibold">No movement in:</span>
            {[15, 30, 60, 90].map(d => (
              <button
                key={d}
                onClick={() => setDeadDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  deadDays === d ? 'bg-white text-gray-800' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >{d}d</button>
            ))}
          </div>
        </div>
        {stats.deadStockProducts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">✅ No dead stock found in the last {deadDays} days!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Product</th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">Current Stock</th>
                </tr>
              </thead>
              <tbody>
                {stats.deadStockProducts.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-800">{p.product_name}</div>
                      <div className="font-mono text-xs text-gray-400">{p.product_id}</div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="bg-gray-100 text-gray-600 font-bold text-xs px-3 py-1 rounded-full tabular-nums">
                        {p.currentStock} units
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CATEGORY DRILL-DOWN MODAL */}
      {selectedCategory && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-[2rem] shadow-2xl flex flex-col border border-gray-100">
            <div className="p-6 text-white flex justify-between items-center" style={{ backgroundColor: categoryColor }}>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter italic">{selectedCategory}</h2>
                <p className="text-sm font-medium opacity-80 mt-1">{categoryProducts.length} products</p>
              </div>
              <button onClick={() => setSelectedCategory(null)} className="bg-white text-gray-900 px-4 py-2 rounded-xl text-xs font-bold shadow-lg">Close</button>
            </div>
            <div className="p-6 overflow-y-auto">
              {categoryProducts.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No products found in this category.</p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase">Product ID</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase">Name</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase">Current Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryProducts.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50 border-b last:border-0 transition-colors">
                        <td className="p-4 font-bold text-[#0a2a5e] text-sm uppercase">{p.product_id}</td>
                        <td className="p-4 text-xs text-gray-500 font-medium">{p.product_name}</td>
                        <td className="p-4">
                          <span className="px-3 py-1 rounded-full text-xs font-black text-white" style={{ backgroundColor: categoryColor }}>
                            {p.currentStock} Units
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOW / HIGH / HERO / DEAD MODAL */}
      {modalType && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-[2rem] shadow-2xl flex flex-col border border-gray-100">
            <div className={`p-6 text-white flex justify-between items-center ${
              modalType === 'low' ? 'bg-red-600' :
              modalType === 'high' ? 'bg-orange-500' :
              modalType === 'hero' ? 'bg-gradient-to-r from-yellow-400 to-orange-400' :
              'bg-gradient-to-r from-gray-600 to-gray-700'
            }`}>
              <h2 className="text-2xl font-black uppercase tracking-tighter italic">
                {modalType === 'low' ? 'Critical Low Stock' :
                 modalType === 'high' ? 'Surplus Stock Alert' :
                 modalType === 'hero' ? '🏆 Hero Products' :
                 '💤 Dead Stock'}
              </h2>
              <button onClick={() => setModalType(null)} className="bg-white text-gray-900 px-4 py-2 rounded-xl text-xs font-bold shadow-lg">Close</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Product ID</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Name</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">
                      {modalType === 'hero' ? 'Total Outward' : 'Stock'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(modalType === 'low' ? stats.lowAlertProducts :
                    modalType === 'high' ? stats.highAlertProducts :
                    modalType === 'hero' ? stats.heroProducts :
                    stats.deadStockProducts
                  ).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 border-b last:border-0 transition-colors">
                      <td className="p-4 font-bold text-[#0a2a5e] text-sm uppercase">{p.product_id}</td>
                      <td className="p-4 text-xs text-gray-500 font-medium">{p.product_name}</td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${
                          modalType === 'low' ? 'bg-red-100 text-red-700' :
                          modalType === 'high' ? 'bg-orange-100 text-orange-700' :
                          modalType === 'hero' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {modalType === 'hero' ? `${p.totalOutward?.toLocaleString()} sold` : `${p.currentStock} Units`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
