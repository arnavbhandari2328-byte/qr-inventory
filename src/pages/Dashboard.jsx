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
      setAiResponse(data.answer || "Error: AI could not generate a response.");
    } catch (err) {
      setAiResponse("Error: Could not reach the AI Assistant.");
    } finally {
      setIsAsking(false);
    }
  };

  // ✅ FIXED IST FORMATTER (Matches the working one from Transactions.jsx)
  const formatIST = (dbDateString) => {
    if (!dbDateString) return "-";
    
    // new Date() naturally understands Supabase's UTC format (+00:00)
    const date = new Date(dbDateString);
    
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  if (loading) return <div className="p-8 font-bold text-gray-500">Loading Dashboard...</div>;

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Dashboard</h1>

      {/* ✅ AI Assistant Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 mb-8">
        <h2 className="text-lg font-bold text-blue-600 mb-3 flex items-center gap-2">
          ✨ Nivee AI Assistant
        </h2>
        <div className="flex gap-2">
          <input 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask: 'Draft a reorder report' or 'Analyze today's activity'..."
            className="flex-1 p-3 border rounded-xl outline-none focus:border-blue-500 transition-all text-sm"
          />
          <button 
            onClick={askGemini}
            disabled={isAsking}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 text-sm"
          >
            {isAsking ? "Thinking..." : "Analyze"}
          </button>
        </div>
        
        {aiResponse && (
          <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {aiResponse}
          </div>
        )}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Products</p>
          <p className="text-3xl font-black text-blue-600">{stats.totalProducts}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Stock Items</p>
          <p className="text-3xl font-black text-green-600">{stats.totalStock}</p>
        </div>
        
        <div onClick={() => setModalType('low')} className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 cursor-pointer hover:shadow-md hover:border-red-300 transition-all">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-bold text-red-400 uppercase tracking-wider">Low Stock Alerts</p>
            <span className="text-xs text-red-300 font-bold underline">View</span>
          </div>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>

        <div onClick={() => setModalType('high')} className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 cursor-pointer hover:shadow-md hover:border-orange-300 transition-all">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-bold text-orange-400 uppercase tracking-wider">High Stock Alerts</p>
            <span className="text-xs text-orange-300 font-bold underline">View</span>
          </div>
          <p className="text-3xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* PIE CHART */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-6 self-start">Stock by Category</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}       
                  outerRadius={95}       
                  paddingAngle={5}
                  dataKey="value"
                  labelLine={true}       
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, "Items"]} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RECENT TRANSACTIONS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activity (IST)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Item</th>
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Type</th>
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Qty</th>
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentTransactions.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-3 text-sm font-bold text-gray-700 whitespace-nowrap">
                      {t.products?.product_id || "Unknown"}
                    </td>
                    <td className="py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${t.transaction_type === 'inward' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {t.transaction_type}
                      </span>
                    </td>
                    <td className="py-3 text-sm font-bold">{t.quantity}</td>
                    <td className="py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatIST(t.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ALERT MODAL */}
      {modalType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col">
            <div className={`p-6 text-white flex justify-between items-center ${modalType === 'low' ? 'bg-red-600' : 'bg-orange-500'}`}>
              <h2 className="text-2xl font-black">{modalType === 'low' ? 'Low Stock' : 'High Stock'}</h2>
              <button onClick={() => setModalType(null)} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-bold">Close</button>
            </div>
            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 border-b text-sm font-bold text-gray-500 uppercase">Product ID</th>
                    <th className="p-3 border-b text-sm font-bold text-gray-500 uppercase">Name</th>
                    <th className="p-3 border-b text-sm font-bold text-gray-500 uppercase">Current Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {(modalType === 'low' ? stats.lowAlertProducts : stats.highAlertProducts).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 border-b last:border-0">
                      <td className="p-3 font-mono font-bold text-gray-700">{p.product_id}</td>
                      <td className="p-3 text-sm text-gray-600">{p.product_name}</td>
                      <td className="p-3"><span className={`px-3 py-1 rounded-full text-sm font-black ${modalType === 'low' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{p.currentStock}</span></td>
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