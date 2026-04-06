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
    recentTransactions: [],
    pieData: [],
    activityData: [], // New state for Bar Chart
    lowAlertProducts: [], 
    highAlertProducts: [] 
  });
  
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null); 

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

      // ✅ Updated to include created_at for the trend chart
      const { data: allTrans } = await supabase
        .from("transactions")
        .select("product_id, transaction_type, quantity, created_at, products(product_id)");

      let totalStock = 0;
      let polish = 0, seamless = 0, nb = 0, other = 0;
      const stockMap = {};
      const dailyMap = {}; // Map for trend data

      (allTrans || []).forEach(t => {
        const adjustedQty = t.transaction_type === "inward" ? Number(t.quantity) : -Number(t.quantity);
        totalStock += adjustedQty;
        if (t.product_id) stockMap[t.product_id] = (stockMap[t.product_id] || 0) + adjustedQty;

        // Categorization logic
        const pId = (t.products?.product_id || "").toUpperCase();
        if (pId.startsWith("NM-PP")) polish += adjustedQty;
        else if (pId.startsWith("NM-NBSMLS")) seamless += adjustedQty;
        else if (pId.startsWith("NM-NB")) nb += adjustedQty;
        else other += adjustedQty;

        // ✅ TREND LOGIC: Group by Date (IST)
        const dateKey = new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { name: dateKey, inward: 0, outward: 0 };
        
        if (t.transaction_type === "inward") {
          dailyMap[dateKey].inward += Number(t.quantity);
        } else {
          dailyMap[dateKey].outward += Number(t.quantity);
        }
      });

      // Sort and slice to last 7 days of activity
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
        activityData, // Set Bar Chart Data
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

  // AI & Export functions remain the same as your provided code...
  const askGemini = async () => { /* ... */ };
  const exportAiData = (format) => { /* ... */ };

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
      hour12: true
    });
  };

  if (loading) return <div className="p-8 font-bold text-gray-500">Loading Dashboard...</div>;

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <h1 className="text-3xl font-black mb-6 text-[#0a2a5e] tracking-tight italic uppercase">Nivee Operations Center</h1>

      {/* AI Assistant Section */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-8">
        <h2 className="text-sm font-black text-blue-600 mb-4 flex items-center gap-2 uppercase tracking-widest">
          ✨ Nivee AI Intelligence
        </h2>
        <div className="flex gap-3">
          <input 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your inventory..."
            className="flex-1 p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
          />
          <button 
            onClick={askGemini}
            disabled={isAsking}
            className="bg-[#0a2a5e] text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-800 transition-all disabled:opacity-50 text-sm shadow-lg active:scale-95"
          >
            {isAsking ? "Processing..." : "Analyze"}
          </button>
        </div>
        {/* AI Response Display Block remains same... */}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Products</p>
          <p className="text-4xl font-black text-[#0a2a5e]">{stats.totalProducts}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Inventory Volume</p>
          <p className="text-4xl font-black text-emerald-600">{stats.totalStock}</p>
        </div>
        <div onClick={() => setModalType('low')} className="bg-white p-6 rounded-3xl shadow-sm border border-red-50 cursor-pointer hover:bg-red-50/50 transition-all group">
          <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] mb-2 group-hover:text-red-600">Critical Low Stock</p>
          <p className="text-4xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>
        <div onClick={() => setModalType('high')} className="bg-white p-6 rounded-3xl shadow-sm border border-orange-50 cursor-pointer hover:bg-orange-50/50 transition-all group">
          <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] mb-2 group-hover:text-orange-600">Surplus Stock</p>
          <p className="text-4xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        {/* NEW: INWARD vs OUTWARD BAR CHART */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-black text-[#0a2a5e] mb-8 uppercase tracking-tight">Movement Trends (Last 7 Days)</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase'}} />
                <Bar dataKey="inward" fill="#10B981" radius={[6, 6, 0, 0]} name="Inward Items" />
                <Bar dataKey="outward" fill="#EF4444" radius={[6, 6, 0, 0]} name="Outward Items" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIE CHART */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
          <h2 className="text-lg font-black text-[#0a2a5e] mb-8 uppercase tracking-tight">Product Distribution</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70} 
                  outerRadius={100} 
                  paddingAngle={8}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* RECENT TRANSACTIONS TABLE */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-black text-[#0a2a5e] mb-6 uppercase tracking-tight">Recent Warehouse Activity</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Code</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time (IST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.recentTransactions.map(t => (
                <tr key={t.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="py-5 text-sm font-black text-[#0a2a5e]">{t.products?.product_id}</td>
                  <td className="py-5">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter ${t.transaction_type === 'inward' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {t.transaction_type}
                    </span>
                  </td>
                  <td className="py-5 text-sm font-bold text-slate-600">{t.quantity} Units</td>
                  <td className="py-5 text-[10px] font-bold text-slate-400">
                    {formatIST(t.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ALERT MODAL CODE (remains same)... */}
    </div>
  );
}