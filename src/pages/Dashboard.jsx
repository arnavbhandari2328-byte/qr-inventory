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
    activityData: [], // ✅ New state for the Bar Chart
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

      // ✅ Added 'created_at' to the query for the Bar Chart
      const { data: allTrans } = await supabase
        .from("transactions")
        .select("product_id, transaction_type, quantity, created_at, products(product_id)");

      let totalStock = 0;
      let polish = 0, seamless = 0, nb = 0, other = 0;
      const stockMap = {};
      const dailyMap = {}; // ✅ Map to store inward/outward totals per day

      (allTrans || []).forEach(t => {
        const adjustedQty = t.transaction_type === "inward" ? Number(t.quantity) : -Number(t.quantity);
        totalStock += adjustedQty;
        if (t.product_id) stockMap[t.product_id] = (stockMap[t.product_id] || 0) + adjustedQty;

        const pId = (t.products?.product_id || "").toUpperCase();
        if (pId.startsWith("NM-PP")) polish += adjustedQty;
        else if (pId.startsWith("NM-NBSMLS")) seamless += adjustedQty;
        else if (pId.startsWith("NM-NB")) nb += adjustedQty;
        else other += adjustedQty;

        // ✅ TREND LOGIC: Group transactions by date for the Bar Chart
        if (t.created_at) {
            const date = new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
            if (!dailyMap[date]) dailyMap[date] = { name: date, inward: 0, outward: 0 };
            
            if (t.transaction_type === "inward") {
                dailyMap[date].inward += Number(t.quantity);
            } else {
                dailyMap[date].outward += Number(t.quantity);
            }
        }
      });

      // ✅ Convert map to array and take last 7 active days
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
        activityData, // ✅ Save Bar Chart Data
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
      XLSX.writeFile(wb, `Nivee_AI_Report_${new Date().getTime()}.xlsx`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text("AI Analysis Report", 14, 15);
      doc.autoTable({ head: [lines[0]], body: lines.slice(1), startY: 20, theme: 'grid' });
      doc.save(`Nivee_AI_Report_${new Date().getTime()}.pdf`);
    }
  };

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
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 tracking-tight">Warehouse Intelligence</h1>

      {/* ✅ AI Assistant Section */}
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
        <div onClick={() => setModalType('low')} className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 cursor-pointer">
          <p className="text-sm font-bold text-red-400 uppercase tracking-wider mb-1">Low Stock Alerts</p>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>
        <div onClick={() => setModalType('high')} className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 cursor-pointer">
          <p className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-1">High Stock Alerts</p>
          <p className="text-3xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        {/* ✅ BAR CHART: Inward vs Outward */}
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
                <Bar dataKey="inward" fill="#10B981" radius={[4, 4, 0, 0]} name="Inward" />
                <Bar dataKey="outward" fill="#EF4444" radius={[4, 4, 0, 0]} name="Outward" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIE CHART */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-6 self-start uppercase tracking-tight">Stock Distribution</h2>
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
      </div>


      {/* ALERT MODAL */}
      {modalType && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-[2rem] shadow-2xl flex flex-col border border-gray-100">
            <div className={`p-6 text-white flex justify-between items-center ${modalType === 'low' ? 'bg-red-600' : 'bg-orange-500'}`}>
              <h2 className="text-2xl font-black uppercase tracking-tighter italic">{modalType === 'low' ? 'CRITICAL LOW STOCK' : 'SURPLUS STOCK ALERT'}</h2>
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
                      <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-black ${modalType === 'low' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{p.currentStock} Units</span></td>
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