import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";

export default function Transactions() {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    product_id: "",
    location_id: "",
    transaction_type: "inward",
    quantity: "",
    party: ""
  });

  useEffect(() => {
    fetchAll();
  }, []);

  // ✅ FETCH DIRECTLY FROM SUPABASE
  async function fetchAll() {
    try {
      const { data: prod } = await supabase.from("products").select("*");
      const { data: loc } = await supabase.from("locations").select("*");
      const { data: trans } = await supabase.from("transactions").select("*");

      if (trans) {
        // Sort newest first
        trans.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }

      setProducts(prod || []);
      setLocations(loc || []);
      setTransactions(trans || []);
    } catch (err) {
      console.error("Failed fetching transactions data", err);
    }
  }

  // ✅ ADD TRANSACTION TO SUPABASE
  const handleAdd = async () => {
    if (!form.product_id || !form.location_id || !form.quantity) {
      alert("Please fill required fields (Product, Location, Quantity)");
      return;
    }

    try {
      const { error } = await supabase.from("transactions").insert([{
        product_id: form.product_id,
        location_id: form.location_id,
        transaction_type: form.transaction_type,
        quantity: Number(form.quantity),
        party: form.party
      }]);

      if (error) throw error;

      setForm({
        product_id: "",
        location_id: "",
        transaction_type: "inward",
        quantity: "",
        party: ""
      });

      fetchAll();
    } catch (err) {
      console.error("ADD TRANSACTION ERROR:", err.message);
      alert("Failed to add transaction. Check console.");
    }
  };

  // ✅ DELETE FROM SUPABASE
  const handleDelete = async (id) => {
    if (!window.confirm("Delete transaction?")) return;

    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      
      fetchAll();
    } catch (err) {
      console.error("DELETE ERROR:", err.message);
    }
  };

  // 📊 EXPORT EXCEL
  const exportToExcel = () => {
    if (!transactions.length) {
      alert("No transactions to export");
      return;
    }

    const exportData = transactions.map((t) => {
      const product = products.find((p) => p.id === t.product_id);
      const location = locations.find((l) => l.id === t.location_id);

      return {
        Date: new Date(t.created_at).toLocaleString(),
        Product: product?.product_name || "",
        Product_Code: product?.product_id || "",
        Type: t.transaction_type,
        Quantity: t.quantity,
        Location: location?.name || "",
        Party: t.party || ""
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "Inventory_Transactions.xlsx");
  };

  // 🔍 SEARCH
  const filtered = transactions.filter((t) => {
    const product = products.find((p) => p.id === t.product_id);
    return product?.product_name?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Transactions</h1>

      {/* ADD FORM */}
      <div className="bg-white shadow rounded p-6 mb-6 space-y-4">
        <div className="grid grid-cols-5 gap-4">

          <select
            value={form.product_id}
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
            className="border p-2 rounded"
          >
            <option value="">Product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name}
              </option>
            ))}
          </select>

          <select
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            className="border p-2 rounded"
          >
            <option value="">Location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <select
            value={form.transaction_type}
            onChange={(e) =>
              setForm({ ...form, transaction_type: e.target.value })
            }
            className="border p-2 rounded"
          >
            <option value="inward">Inward</option>
            <option value="outward">Outward</option>
          </select>

          <input
            type="number"
            placeholder="Qty"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="border p-2 rounded"
          />

          <input
            placeholder="Party"
            value={form.party}
            onChange={(e) => setForm({ ...form, party: e.target.value })}
            className="border p-2 rounded"
          />
        </div>

        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-6 py-2 rounded"
        >
          Add Transaction
        </button>
      </div>

      {/* EXPORT + SEARCH */}
      <div className="flex justify-between mb-4">
        <input
          placeholder="Search product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-64"
        />

        <button
          onClick={exportToExcel}
          className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700"
        >
          Export Excel
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded p-6 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Date</th>
              <th className="p-2">Product</th>
              <th className="p-2">Type</th>
              <th className="p-2">Qty</th>
              <th className="p-2">Location</th>
              <th className="p-2">Party</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((t) => {
              const product = products.find((p) => p.id === t.product_id);
              const location = locations.find((l) => l.id === t.location_id);

              return (
                <tr key={t.id} className="border-b">
                  <td className="p-2">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td className="p-2">{product?.product_name}</td>
                  <td className={`p-2 font-semibold ${t.transaction_type === "inward" ? "text-green-600" : "text-red-600"}`}>
                    {t.transaction_type}
                  </td>
                  <td className="p-2">{t.quantity}</td>
                  <td className="p-2">{location?.name}</td>
                  <td className="p-2">{t.party}</td>
                  <td className="p-2">
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}