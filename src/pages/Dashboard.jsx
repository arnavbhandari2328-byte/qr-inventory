import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStock: 0,
    recentTransactions: [],
    pieData: []
  });
  const [loading, setLoading] = useState(true);

  // Chart Colors: Blue for Polish, Green for Seamless, Orange for NB, Purple for Other
  const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"]; 

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { count: productCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

      const { data: recentTrans } = await supabase
        .from("transactions")
        .select("*, products(product_name, product_id), locations(name)")
        .order("created_at", { ascending: false })
        .limit(5);

      // Fetch all transactions to calculate the category stock
      const { data: allTrans } = await supabase
        .from("transactions")
        .select("transaction_type, quantity, products(product_id)");

      let totalStock = 0;
      let polish = 0;
      let seamless = 0;
      let nb = 0;
      let other = 0;

      (allTrans || []).forEach(t => {
        const isAdd = t.transaction_type === "inward";
        const qty = Number(t.quantity);
        const adjustedQty = isAdd ? qty : -qty;

        totalStock += adjustedQty;

        const pId = (t.products?.product_id || "").toUpperCase();

        // 🚀 SMART CATEGORY ROUTING
        if (pId.startsWith("NM-PP")) {
          polish += adjustedQty;
        } else if (pId.startsWith("NM-NBSMLS")) {
          // Check Seamless FIRST so it doesn't get trapped in the regular NB category
          seamless += adjustedQty;
        } else if (pId.startsWith("NM-NB")) {
          nb += adjustedQty;
        } else {
          other += adjustedQty;
        }
      });

      // Build the Pie Chart Data
      const pieDataRaw = [
        { name: "Polish Pipe", value: polish },
        { name: "Seamless Pipe", value: seamless },
        { name: "NB Pipe", value: nb },
        { name: "Other Products", value: other }
      ];
      
      // Filter out categories that have 0 stock to keep the chart clean
      const pieData = pieDataRaw.filter(item => item.value > 0);

      setStats({
        totalProducts: productCount || 0,
        totalStock,
        recentTransactions: recentTrans || [],
        pieData
      });
    } catch (err) {
      console.error("Dashboard error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatIST = (utcString) => {
    if (!utcString) return "Unknown Date";
    const date = new Date(utcString.endsWith("Z") ? utcString : utcString + "Z");
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true
    });
  };

  if (loading) return <div className="p-8 font-bold text-gray-500">Loading Dashboard...</div>;

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Dashboard</h1>

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* PIE CHART */}
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
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
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

        {/* RECENT TRANSACTIONS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h2>
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
                {stats.recentTransactions.length === 0 ? (
                  <tr><td colSpan="4" className="py-4 text-center text-gray-400">No recent activity</td></tr>
                ) : (
                  stats.recentTransactions.map(t => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="py-3 text-sm font-bold text-gray-700">
                        {t.products?.product_id || "Unknown"}
                      </td>
                      <td className="py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${t.transaction_type === 'inward' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {t.transaction_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-sm font-bold">{t.quantity}</td>
                      <td className="py-3 text-xs text-gray-500">{formatIST(t.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}