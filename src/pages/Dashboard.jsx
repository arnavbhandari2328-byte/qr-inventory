import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStock: 0,
    lowAlerts: 0, 
    highAlerts: 0, 
    recentTransactions: [],
    pieData: [],
    lowAlertProducts: [], 
    highAlertProducts: [] 
  });
  
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null); 

  // ✅ AI States
  const [question, setQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"]; 

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
        .select("product_id, transaction_type, quantity, products(product_id)");

      let totalStock = 0;
      let polish = 0, seamless = 0, nb = 0, other = 0;
      const stockMap = {};

      (allTrans || []).forEach(t => {
        const adjustedQty = t.transaction_type === "inward" ? Number(t.quantity) : -Number(t.quantity);
        totalStock += adjustedQty;
        if (t.product_id) stockMap[t.product_id] = (stockMap[t.product_id] || 0) + adjustedQty;

        const pId = (t.products?.product_id || "").toUpperCase();
        if (pId.startsWith("NM-PP")) polish += adjustedQty;
        else if (pId.startsWith("NM-NBSMLS")) seamless += adjustedQty;
        else if (pId.startsWith("NM-NB")) nb += adjustedQty;
        else other += adjustedQty;
      });

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
        pieData: [
          { name: "Polish Pipe", value: polish },
          { name: "Seamless Pipe", value: seamless },
          { name: "NB Pipe", value: nb },
          { name: "Other", value: other }
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

  // ✅ AI Interaction Function
  const askGemini = async () => {
    if (!question) return;
    setIsAsking(true);
    setAiResponse("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question,
          inventoryData: {
            totalStock: stats.totalStock,
            lowStockItems: stats.lowAlertProducts,
            overstockItems: stats.highAlertProducts,
            recentActivity: stats.recentTransactions
          }
        }),
      });
      const data = await res.json();
      setAiResponse(data.answer || data.error);
    } catch (err) {
      setAiResponse("Error: Could not reach the AI Assistant.");
    } finally {
      setIsAsking(false);
    }
  };

  const formatIST = (utcString) => {
    if (!utcString) return "-";
    const date = new Date(utcString.endsWith("Z") ? utcString : utcString + "Z");
    return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  };

  if (loading) return <div className="p-8 font-bold text-gray-500">Loading Nivee Dashboard...</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Dashboard</h1>

      {/* ✨ NEW: AI ASSISTANT SECTION */}
      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-3xl shadow-xl mb-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-white/20 p-2 rounded-lg">✨</div>
          <h2 className="text-xl font-bold">Nivee AI Business Intelligence</h2>
        </div>
        <div className="flex gap-3">
          <input 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && askGemini()}
            placeholder="Ask anything: 'Draft a reorder report' or 'Summarize today's activity'..."
            className="flex-1 p-4 rounded-2xl text-gray-800 focus:ring-4 focus:ring-white/30 outline-none transition-all"
          />
          <button 
            onClick={askGemini}
            disabled={isAsking}
            className="bg-white text-indigo-700 px-8 py-4 rounded-2xl font-black hover:bg-indigo-50 transition-all disabled:opacity-50 shadow-lg"
          >
            {isAsking ? "Analyzing..." : "Analyze"}
          </button>
        </div>
        
        {aiResponse && (
          <div className="mt-6 p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 animate-in fade-in slide-in-from-top-4 duration-500">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
          </div>
        )}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Products</p>
          <p className="text-3xl font-black text-blue-600">{stats.totalProducts}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Stock</p>
          <p className="text-3xl font-black text-green-600">{stats.totalStock}</p>
        </div>
        <div onClick={() => setModalType('low')} className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 cursor-pointer hover:scale-105 transition-transform">
          <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Low Stock</p>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>
        <div onClick={() => setModalType('high')} className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 cursor-pointer hover:scale-105 transition-transform">
          <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">Overstock</p>
          <p className="text-3xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* PIE CHART */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-50">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Stock Distribution</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {stats.pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RECENT ACTIVITY */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-50">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Recent Activity (IST)</h2>
          <div className="space-y-4">
            {stats.recentTransactions.map(t => (
              <div key={t.id} className="flex justify-between items-center p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <div>
                  <p className="font-bold text-gray-800">{t.products?.product_id}</p>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-tighter">{t.locations?.name} • {formatIST(t.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${t.transaction_type === 'inward' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.transaction_type === 'inward' ? '+' : '-'}{t.quantity}
                  </p>
                  <p className="text-[10px] font-bold text-gray-300 uppercase">{t.transaction_type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL FOR ALERTS */}
      {modalType && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
            <div className={`p-6 flex justify-between items-center text-white ${modalType === 'low' ? 'bg-red-600' : 'bg-orange-500'}`}>
              <h2 className="text-xl font-bold">{modalType === 'low' ? 'Low Stock Items' : 'High Stock Items'}</h2>
              <button onClick={() => setModalType(null)} className="bg-white/20 hover:bg-white/40 px-4 py-2 rounded-xl text-sm font-bold transition-all">Close</button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              { (modalType === 'low' ? stats.lowAlertProducts : stats.highAlertProducts).map(p => (
                <div key={p.id} className="flex justify-between items-center py-3 border-b last:border-0">
                  <div>
                    <p className="font-bold text-gray-800">{p.product_id}</p>
                    <p className="text-xs text-gray-500">{p.product_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-gray-800">{p.currentStock}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Current Stock</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}