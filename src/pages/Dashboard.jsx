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
    activityData: [],
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

      const { data: allTrans } = await supabase
        .from("transactions")
        .select("product_id, transaction_type, quantity, created_at, products(product_id)");

      let totalStock = 0;
      let polish = 0, seamless = 0, nb = 0, other = 0;
      const stockMap = {};
      const dailyMap = {};

      (allTrans || []).forEach(t => {
        const adjustedQty = t.transaction_type === "inward" ? Number(t.quantity) : -Number(t.quantity);
        totalStock += adjustedQty;
        if (t.product_id) stockMap[t.product_id] = (stockMap[t.product_id] || 0) + adjustedQty;

        const pId = (t.products?.product_id || "").toUpperCase();
        if (pId.startsWith("NM-PP")) polish += adjustedQty;
        else if (pId.startsWith("NM-NBSMLS")) seamless += adjustedQty;
        else if (pId.startsWith("NM-NB")) nb += adjustedQty;
        else other += adjustedQty;

        const dateKey = new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { name: dateKey, inward: 0, outward: 0 };
        
        if (t.transaction_type === "inward") dailyMap[dateKey].inward += Number(t.quantity);
        else dailyMap[dateKey].outward += Number(t.quantity);
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

  const askGemini = async () => {
    if (!question) return;
    setIsAsking(true);
    setAiResponse("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question }), 
      });
      const data = await res.json();
      setAiResponse(data.answer || "AI could not generate a response.");
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

    if (lines.length === 0) return alert("Ask for a 'Table report' to export.");

    if (format === 'excel') {
      const ws = XLSX.utils.aoa_to_sheet(lines);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AI_Report");
      XLSX.writeFile(wb, `Nivee_AI_Report_${Date.now()}.xlsx`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text("Nivee Metal AI Report", 14, 15);
      doc.autoTable({ head: [lines[0]], body: lines.slice(1), startY: 20, theme: 'grid' });
      doc.save(`Nivee_AI_Report_${Date.now()}.pdf`);
    }
  };

  const formatIST = (dbDateString) => {
    if (!dbDateString) return "-";
    const date = new Date(dbDateString);
    return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  };

  if (loading) return <div className="p-8 font-bold text-gray-500">Loading Warehouse Intelligence...</div>;

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <h1 className="text-3xl font-black mb-6 text-[#0a2a5e] tracking-tight uppercase">Dashboard</h1>

      {/* AI Assistant Section */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-8">
        <h2 className="text-sm font-black text-blue-600 mb-4 uppercase tracking-widest">✨ Nivee AI Intelligence</h2>
        <div className="flex gap-3">
          <input 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your inventory..."
            className="flex-1 p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
          />
          <button onClick={askGemini} disabled={isAsking} className="bg-[#0a2a5e] text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-800 transition-all disabled:opacity-50 text-sm">
            {isAsking ? "Thinking..." : "Analyze"}
          </button>
        </div>
        {aiResponse && (
          <div className="mt-4 p-4 bg-white rounded-2xl border border-blue-50 text-sm whitespace-pre-wrap">
            <div className="flex gap-2 mb-2 justify-end">
                <button onClick={() => exportAiData('excel')} className="text-[10px] bg-emerald-600 text-white px-3 py-1 rounded-lg">Excel</button>
                <button onClick={() => exportAiData('pdf')} className="text-[10px] bg-red-600 text-white px-3 py-1 rounded-lg">PDF</button>
            </div>
            {aiResponse}
          </div>
        )}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Products</p>
          <p className="text-3xl font-black text-[#0a2a5e]">{stats.totalProducts}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Stock</p>
          <p className="text-3xl font-black text-emerald-600">{stats.totalStock}</p>
        </div>
        <div onClick={() => setModalType('low')} className="bg-white p-6 rounded-3xl shadow-sm border border-red-50 cursor-pointer">
          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Low Stock Alerts</p>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>
        <div onClick={() => setModalType('high')} className="bg-white p-6 rounded-3xl shadow-sm border border-orange-50 cursor-pointer">
          <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">High Stock Alerts</p>
          <p className="text-3xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-black text-[#0a2a5e] mb-8 uppercase tracking-tight">Movement Trends</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                <Tooltip />
                <Legend verticalAlign="top" align="right" />
                <Bar dataKey="inward" fill="#10B981" radius={[6, 6, 0, 0]} name="Inward" />
                <Bar dataKey="outward" fill="#EF4444" radius={[6, 6, 0, 0]} name="Outward" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
          <h2 className="text-lg font-black text-[#0a2a5e] mb-8 uppercase tracking-tight">Stock Distribution</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* Modals remain same as before... */}
    </div>
  );
}