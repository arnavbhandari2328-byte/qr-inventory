import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from "recharts";

const COLORS = ["#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#8b5cf6"];

export default function Dashboard() {

  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({ totalItems: 0, lowStock: 0, totalQty: 0 });
  const [locationData, setLocationData] = useState([]);
  const [movementData, setMovementData] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: prod } = await supabase.from("products").select("*");
    const { data: trans } = await supabase.from("transactions").select("*");
    const { data: locs } = await supabase.from("locations").select("*");

    const productsData = prod || [];
    const transData = trans || [];
    const locations = locs || [];

    // map id -> name
    const locationNameMap = {};
    locations.forEach(l => {
      locationNameMap[l.id] = l.name;
    });

    // ---------------- TOTAL STOCK PER PRODUCT ----------------
    const processed = productsData.map(p => {
      const related = transData.filter(t => t.product_id === p.id);

      let total = 0;
      related.forEach(t => {
        const qty = Number(t.quantity) || 0;
        if (t.transaction_type === "inward") total += qty;
        else total -= qty;
      });

      return {
        ...p,
        total,
        low: Number(p.low_stock_alert || 0)
      };
    });

    const totalItems = processed.length;
    const lowStock = processed.filter(p => p.total <= p.low).length;
    const totalQty = processed.reduce((a, b) => a + b.total, 0);

    setSummary({ totalItems, lowStock, totalQty });
    setProducts(processed);

    // ---------------- LOCATION DISTRIBUTION PIE ----------------
    const locationMap = {};

    transData.forEach(t => {
      const locName = locationNameMap[t.location_id];
      if (!locName) return;

      const qty = t.transaction_type === "inward"
        ? Number(t.quantity)
        : -Number(t.quantity);

      if (!locationMap[locName]) locationMap[locName] = 0;
      locationMap[locName] += qty;
    });

    const locationChart = Object.keys(locationMap)
      .filter(key => locationMap[key] > 0)
      .map(key => ({ name: key, value: locationMap[key] }));

    setLocationData(locationChart);

    // ---------------- MOVEMENT BAR CHART ----------------
    let inward = 0;
    let outward = 0;

    transData.forEach(t => {
      const qty = Number(t.quantity) || 0;
      if (t.transaction_type === "inward") inward += qty;
      else outward += qty;
    });

    setMovementData([
      { type: "Inward", quantity: inward },
      { type: "Outward", quantity: outward }
    ]);
  }

  return (
    <div style={{ padding: 30, fontFamily: "system-ui" }}>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 25 }}>
        Inventory Dashboard
      </h1>

      {/* SUMMARY CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginBottom: 30 }}>
        <div style={card}>
          <p>Total Products</p>
          <h2>{summary.totalItems}</h2>
        </div>

        <div style={{ ...card, background: "#fff3f3" }}>
          <p>Low Stock</p>
          <h2 style={{ color: "red" }}>{summary.lowStock}</h2>
        </div>

        <div style={{ ...card, background: "#f0fff4" }}>
          <p>Total Quantity</p>
          <h2 style={{ color: "green" }}>{summary.totalQty}</h2>
        </div>
      </div>

      {/* CHART ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 25, marginBottom: 35 }}>

        {/* PIE */}
        <div style={chartCard}>
          <h3>Stock Distribution by Location</h3>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={locationData}
                dataKey="value"
                nameKey="name"
                outerRadius={110}
                label
              >
                {locationData.map((entry, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* MOVEMENT */}
        <div style={chartCard}>
          <h3>Stock Movement</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={movementData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="quantity" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* PRODUCT TABLE */}
      <table style={{ width: "100%", background: "white", borderRadius: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>ID</th>
            <th>Name</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {products.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{p.product_id}</td>
              <td>{p.product_name}</td>

              <td style={{
                fontWeight: 700,
                color: p.total <= 0 ? "red" : "green"
              }}>
                {p.total}
              </td>

              <td style={{
                color: p.total <= p.low ? "red" : "green",
                fontWeight: 600
              }}>
                {p.total <= p.low ? "Low" : "OK"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}

const card = {
  background: "white",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
};

const chartCard = {
  background: "white",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
};
