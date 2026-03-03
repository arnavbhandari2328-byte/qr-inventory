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
      let polish = 0;
      let seamless = 0;
      let nb = 0;
      let other = 0;

      const stockMap = {};

      (allTrans || []).forEach(t => {
        const isAdd = t.transaction_type === "inward";
        const qty = Number(t.quantity);
        const adjustedQty = isAdd ? qty : -qty;

        totalStock += adjustedQty;

        if (t.product_id) {
          stockMap[t.product_id] = (stockMap[t.product_id] || 0) + adjustedQty;
        }

        const pId = (t.products?.product_id || "").toUpperCase();

        if (pId.startsWith("NM-PP")) {
          polish += adjustedQty;
        } else if (pId.startsWith("NM-NBSMLS")) {
          seamless += adjustedQty;
        } else if (pId.startsWith("NM-NB")) {
          nb += adjustedQty;
        } else {
          other += adjustedQty;
        }
      });

      let lowAlertsCount = 0;
      let highAlertsCount = 0;
      
      const lowList = [];
      const highList = [];

      (productsData || []).forEach(p => {
        const currentStock = stockMap[p.id] || 0;
        
        if (p.low_stock_alert > 0 && currentStock <= p.low_stock_alert) {
          lowAlertsCount++;
          lowList.push({ ...p, currentStock });
        }
        if (p.high_stock_alert > 0 && currentStock >= p.high_stock_alert) {
          highAlertsCount++;
          highList.push({ ...p, currentStock });
        }
      });

      const pieDataRaw = [
        { name: "Polish Pipe", value: polish },
        { name: "Seamless Pipe", value: seamless },
        { name: "NB Pipe", value: nb },
        { name: "Other", value: other }
      ];
      
      const pieData = pieDataRaw.filter(item => item.value > 0);

      setStats({
        totalProducts: productsData?.length || 0,
        totalStock,
        lowAlerts: lowAlertsCount,
        highAlerts: highAlertsCount,
        recentTransactions: recentTrans || [],
        pieData,
        lowAlertProducts: lowList,
        highAlertProducts: highList
      });
    } catch (err) {
      console.error("Dashboard error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ FORCED IST TIME FIX
  const formatIST = (utcString) => {
    if (!utcString) return "Unknown Date";
    
    // Explicitly forces the UTC tag ("Z") so JavaScript parses it correctly before converting.
    const date = new Date(utcString.endsWith("Z") ? utcString : utcString + "Z");
    
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

  const getAlertBadge = (productId) => {
    const isLow = stats.lowAlertProducts.some(p => p.id === productId);
    const isHigh = stats.highAlertProducts.some(p => p.id === productId);

    if (isLow) return <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded ml-2 font-bold uppercase tracking-wider">Low Alert</span>;
    if (isHigh) return <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded ml-2 font-bold uppercase tracking-wider">Overstocked</span>;
    return null;
  };

  if (loading) return <div className="p-8 font-bold text-gray-500">Loading Dashboard...</div>;

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Products</p>
          <p className="text-3xl font-black text-blue-600">{stats.totalProducts}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total Stock Items</p>
          <p className="text-3xl font-black text-green-600">{stats.totalStock}</p>
        </div>
        
        <div 
          onClick={() => setModalType('low')}
          className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 cursor-pointer hover:shadow-md hover:border-red-300 transition-all"
        >
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-bold text-red-400 uppercase tracking-wider">Low Stock Alerts</p>
            <span className="text-xs text-red-300 font-bold underline">View</span>
          </div>
          <p className="text-3xl font-black text-red-600">{stats.lowAlerts}</p>
        </div>

        <div 
          onClick={() => setModalType('high')}
          className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 cursor-pointer hover:shadow-md hover:border-orange-300 transition-all"
        >
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-bold text-orange-400 uppercase tracking-wider">High Stock Alerts</p>
            <span className="text-xs text-orange-300 font-bold underline">View</span>
          </div>
          <p className="text-3xl font-black text-orange-600">{stats.highAlerts}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-6 self-start">Stock by Category</h2>
          {stats.pieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 font-medium">No stock data available</div>
          ) : (
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
                  <Tooltip formatter={(value) => [value, "Items in Stock"]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Item</th>
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Alert</th>
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Type</th>
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Qty</th>
                  <th className="pb-3 text-xs font-bold text-gray-400 uppercase">Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentTransactions.length === 0 ? (
                  <tr><td colSpan="5" className="py-4 text-center text-gray-400">No recent activity</td></tr>
                ) : (
                  stats.recentTransactions.map(t => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="py-3 text-sm font-bold text-gray-700 whitespace-nowrap">
                        {t.products?.product_id || "Unknown"}
                      </td>
                      <td className="py-3">
                         {t.product_id ? getAlertBadge(t.product_id) : null}
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${t.transaction_type === 'inward' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {t.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 text-sm font-bold">{t.quantity}</td>
                      <td className="py-3 text-xs text-gray-500 whitespace-nowrap">
                         {/* ✅ Applying the IST translation function explicitly here */}
                         {formatIST(t.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col">
            
            <div className={`p-6 text-white flex justify-between items-center ${modalType === 'low' ? 'bg-red-600' : 'bg-orange-500'}`}>
              <h2 className="text-2xl font-black">
                {modalType === 'low' ? 'Low Stock Warnings' : 'High Stock Warnings'}
              </h2>
              <button 
                onClick={() => setModalType(null)} 
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 border-b text-sm font-bold text-gray-500 uppercase">Product ID</th>
                    <th className="p-3 border-b text-sm font-bold text-gray-500 uppercase">Name</th>
                    <th className="p-3 border-b text-sm font-bold text-gray-500 uppercase">Current Stock</th>
                    <th className="p-3 border-b text-sm font-bold text-gray-500 uppercase">Alert Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {(modalType === 'low' ? stats.lowAlertProducts : stats.highAlertProducts).length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-gray-400 font-bold">
                        No alerts in this category right now!
                      </td>
                    </tr>
                  ) : (
                    (modalType === 'low' ? stats.lowAlertProducts : stats.highAlertProducts).map(p => (
                      <tr key={p.id} className="hover:bg-gray-50 border-b last:border-0">
                        <td className="p-3 font-mono font-bold text-gray-700">{p.product_id}</td>
                        <td className="p-3 text-sm text-gray-600">{p.product_name}</td>
                        <td className="p-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-black ${modalType === 'low' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {p.currentStock}
                          </span>
                        </td>
                        <td className="p-3 text-sm font-bold text-gray-400">
                          {modalType === 'low' ? `<= ${p.low_stock_alert}` : `>= ${p.high_stock_alert}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}