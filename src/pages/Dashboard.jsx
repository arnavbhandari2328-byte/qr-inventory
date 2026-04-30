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
    categoryProductsMap: {}
  });
  
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null); // 'low' | 'high'
  const [selectedCategory, setSelectedCategory] = useState(null); // pie slice click

  const [question, setQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  // 6 colors for pie: Seamless Pipe, Polish Pipe, NB Pipe, Sheets, Non-Polish Pipe, Others
  const COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#EC4899", "#F97316", "#8B5CF6"];
  const CATEGORY_COLORS = {
    "Seamless Pipe":   "#F59E0B",
    "Polish Pipe":     "#3B82F6",
    "NB Pipe":         "#10B981",
    "Sheets":          "#EC4899",
    "Non-Polish Pipe": "#F97316",
    "Others":          "#8B5CF6"
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

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

      const { data: allTrans } = await supabase
        .from("transactions")
        .select("product_id, transaction_type, quantity, created_at, products(product_id, product_name)");

      let totalStock = 0;
      let polish = 0, seamless = 0, nb = 0, sheets = 0, nonPolish = 0, other = 0;
      const stockMap = {};
      const dailyMap = {};
      const productCategory = {}; // uuid → category name
      const productInfo = {};     // uuid → { product_id, product_name }

      (allTrans || []).forEach(t => {
        const adjustedQty = t.transaction_type === "inward" ? Number(t.quantity) : -Number(t.quantity);
        totalStock += adjustedQty;

        if (t.product_id) {
          stockMap[t.product_id] = (stockMap[t.product_id] || 0) + adjustedQty;
          if (!productInfo[t.product_id]) {
            productInfo[t.product_id] = {
              product_id: t.products?.product_id || "",
              product_name: t.products?.product_name || ""
            };
          }
        }

        const pId = (t.products?.product_id || "").toUpperCase();
        const pName = (t.products?.product_name || "").toUpperCase();

        let cat;
        if (pId.startsWith("NM-PP")) {
          polish += adjustedQty; cat = "Polish Pipe";
        } else if (pId.startsWith("NM-NBSMLS")) {
          seamless += adjustedQty; cat = "Seamless Pipe";
        } else if (pId.startsWith("NM-NB")) {
          nb += adjustedQty; cat = "NB Pipe";
        } else if (pId.startsWith("NM-SH") || pId.startsWith("NM-SNO") || pId.includes("SHEET") || pName.includes("SHEET")) {
          sheets += adjustedQty; cat = "Sheets";
        } else if (pId.startsWith("NM-NMPR") || pId.startsWith("NM-NPS") || pId.startsWith("NM-NPRE")) {
          nonPolish += adjustedQty; cat = "Non-Polish Pipe";
        } else {
          other += adjustedQty; cat = "Others";
        }

        if (t.product_id) productCategory[t.product_id] = cat;

        if (t.created_at) {
          const date = new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          if (!dailyMap[date]) dailyMap[date] = { name: date, inward: 0, outward: 0 };
          if (t.transaction_type === "inward") dailyMap[date].inward += Number(t.quantity);
          else dailyMap[date].outward += Number(t.quantity);
        }
      });

      // Build category → products list
      const categoryProductsMap = {};
      Object.entries(stockMap).forEach(([uuid, stock]) => {
        const cat = productCategory[uuid] || "Others";
        if (!categoryProductsMap[cat]) categoryProductsMap[cat] = [];
        const info = productInfo[uuid] || {};
        categoryProductsMap[cat].push({
          id: uuid,
          product_id: info.product_id,
          product_name: info.product_name,
          currentStock: stock
        });
      });

      // Sort each category by product_id
      Object.keys(categoryProductsMap).forEach(cat => {
        categoryProductsMap[cat].sort((a, b) => a.product_id.localeCompare(b.product_id));
      });

      const activityData = Object.values(dailyMap).slice(-7);

      const lowList = [], highList = [];
      (productsData || []).forEach(p => {
        const currentStock = stockMap[p.id] || 0;
        if (p.low_stock_alert > 0 && currentStock <= p.low_stock_alert) lowList.push({ ...p, currentStock });
        if (p.high_stock_alert > 0 && currentStock >= p.high_stock_alert) highList.push({ ...p, currentStock });
      });

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
        highAlertProducts: highList
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Products</p>
          <p className="text-3xl font-black text-blue-600">{stats.totalProducts}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Stock Items</p>
          <p className="text-3xl font-black text-green-600">{stats.totalStock}</p>
        </div>
        <div onClick={() => setModalType('low')} className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 cursor-pointer hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-red-400 uppercase tracking-wider mb-1">Low Stock Alerts</p>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>
        <div onClick={() => setModalType('high')} className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 cursor-pointer hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-1">High Stock Alerts</p>
          <p className="text-3xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* BAR CHART */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-6 uppercase tracking-tight">Stock Movements (Last 7 Days)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold'}} />
                <Tooltip cursor={{fill: '#f9fafb'}} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px'}} />
                <Bar dataKey="inward" fill="#10B981" radius={[4,4,0,0]} name="Inward" />
                <Bar dataKey="outward" fill="#EF4444" radius={[4,4,0,0]} name="Outward" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIE CHART — 6 categories, clickable */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-1 self-start uppercase tracking-tight">Stock Distribution</h2>
          <p className="text-xs text-gray-400 self-start mb-4">Click any slice to view products</p>
          <div className="h-72 w-full cursor-pointer">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  onClick={(data) => setSelectedCategory(data.name)}
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      style={{ cursor: "pointer", outline: "none" }}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, "Items"]} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
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

      {/* LOW / HIGH ALERT MODAL */}
      {modalType && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-[2rem] shadow-2xl flex flex-col border border-gray-100">
            <div className={`p-6 text-white flex justify-between items-center ${modalType === 'low' ? 'bg-red-600' : 'bg-orange-500'}`}>
              <h2 className="text-2xl font-black uppercase tracking-tighter italic">
                {modalType === 'low' ? 'CRITICAL LOW STOCK' : 'SURPLUS STOCK ALERT'}
              </h2>
              <button onClick={() => setModalType(null)} className="bg-white text-gray-900 px-4 py-2 rounded-xl text-xs font-bold shadow-lg">Close</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Product ID</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Name</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {(modalType === 'low' ? stats.lowAlertProducts : stats.highAlertProducts).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 border-b last:border-0 transition-colors">
                      <td className="p-4 font-bold text-[#0a2a5e] text-sm uppercase">{p.product_id}</td>
                      <td className="p-4 text-xs text-gray-500 font-medium">{p.product_name}</td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${modalType === 'low' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                          {p.currentStock} Units
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
