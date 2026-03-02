import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";

export default function Transactions() {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);

  // Pagination States
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50; 

  const [form, setForm] = useState({
    product_id: "",
    location_id: "",
    transaction_type: "inward",
    quantity: "",
    party: ""
  });

  useEffect(() => {
    fetchDropdowns();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [page]);

  async function fetchDropdowns() {
    const { data: prod } = await supabase.from("products").select("*");
    const { data: loc } = await supabase.from("locations").select("*");
    setProducts(prod || []);
    setLocations(loc || []);
  }

  async function fetchTransactions() {
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: trans, count, error } = await supabase
        .from("transactions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setTransactions(trans || []);
      if (count !== null) setTotalCount(count);
    } catch (err) {
      console.error("Failed fetching paginated transactions", err);
    }
  }

  const handleSave = async () => {
    if (!form.product_id || !form.location_id || !form.quantity) {
      alert("Please fill required fields (Product, Location, Quantity)");
      return;
    }

    try {
      // Identify current employee
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        product_id: form.product_id,
        location_id: form.location_id,
        transaction_type: form.transaction_type,
        quantity: Number(form.quantity),
        party: form.party,
        created_by_email: user?.email || "Manual Entry" // Logs current user
      };

      if (editingId) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert([payload]);
        if (error) throw error;
      }

      setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "" });
      setEditingId(null);
      setPage(0);
      fetchTransactions();
    } catch (err) {
      alert("Failed to save transaction.");
    }
  };

  const handleEditClick = (t) => {
    setForm({
      product_id: t.product_id,
      location_id: t.location_id,
      transaction_type: t.transaction_type,
      quantity: t.quantity,
      party: t.party || ""
    });
    setEditingId(t.id);
  };

  const cancelEdit = () => {
    setForm({ product_id: "", location_id: "", transaction_type: "inward", quantity: "", party: "" });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete transaction?")) return;
    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      fetchTransactions();
    } catch (err) {
      console.error("DELETE ERROR:", err.message);
    }
  };

  const exportToExcel = async () => {
    try {
      const { data: allTrans, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!allTrans?.length) {
        alert("No transactions to export");
        return;
      }

      const exportData = allTrans.map((t) => {
        const product = products.find((p) => p.id === t.product_id);
        const location = locations.find((l) => l.id === t.location_id);

        return {
          Date: new Date(t.created_at).toLocaleString(),
          Product: product?.product_name || "",
          Product_Code: product?.product_id || "",
          Type: t.transaction_type.toUpperCase(),
          Quantity: t.quantity,
          Location: location?.name || "",
          Party: t.party || "",
          Done_By: t.created_by_email || "System" // ✅ Includes Employee in Excel
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      XLSX.writeFile(wb, "Nivee_Metal_Transactions.xlsx");
    } catch (err) {
      alert("Export failed.");
    }
  };

  const filtered = transactions.filter((t) => {
    const product = products.find((p) => p.id === t.product_id);
    return product?.product_name?.toLowerCase().includes(search.toLowerCase());
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Transactions</h1>

      {/* FORM SECTION */}
      <div className="bg-white shadow rounded p-6 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="border p-2 rounded">
            <option value="">Select Product</option>
            {products.map((p) => (<option key={p.id} value={p.id}>{p.product_name}</option>))}
          </select>
          <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} className="border p-2 rounded">
            <option value="">Select Location</option>
            {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
          </select>
          <select value={form.transaction_type} onChange={(e) => setForm({ ...form, transaction_type: e.target.value })} className="border p-2 rounded font-bold">
            <option value="inward">INWARD (+)</option>
            <option value="outward">OUTWARD (-)</option>
          </select>
          <input type="number" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="border p-2 rounded" />
          <input placeholder="Party Name" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} className="border p-2 rounded" />
        </div>
        <div className="flex gap-3">
          <button onClick={handleSave} className={`text-white px-8 py-2 rounded font-bold ${editingId ? 'bg-orange-500 shadow-orange-100' : 'bg-blue-600 shadow-blue-100'}`}>
            {editingId ? "Update Entry" : "Save Entry"}
          </button>
          {editingId && <button onClick={cancelEdit} className="bg-gray-400 text-white px-6 py-2 rounded">Cancel</button>}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <input placeholder="Search products on this page..." value={search} onChange={(e) => setSearch(e.target.value)} className="border p-3 rounded w-80 shadow-sm" />
        <button onClick={exportToExcel} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg transition-all">Export to Excel</button>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white shadow rounded overflow-x-auto mb-6">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase">Date</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase">Product</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase">Type</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase">Qty</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase">Location</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase">Employee</th> {/* ✅ Display Column */}
              <th className="p-4 text-xs font-bold text-gray-400 uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const product = products.find((p) => p.id === t.product_id);
              const location = locations.find((l) => l.id === t.location_id);

              return (
                <tr key={t.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-sm text-gray-600">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="p-4 font-bold text-gray-800">{product?.product_name}</td>
                  <td className={`p-4 font-black ${t.transaction_type === "inward" ? "text-green-600" : "text-red-600"}`}>
                    {t.transaction_type.toUpperCase()}
                  </td>
                  <td className="p-4 font-mono font-bold">{t.quantity}</td>
                  <td className="p-4 text-sm text-gray-600">{location?.name}</td>
                  <td className="p-4 text-xs font-medium text-blue-500 italic">
                    {t.created_by_email || "System"} {/* ✅ Show employee email */}
                  </td>
                  <td className="p-4 flex gap-2">
                    <button onClick={() => handleEditClick(t)} className="text-blue-600 font-bold hover:underline">Edit</button>
                    <button onClick={() => handleDelete(t.id)} className="text-red-500 font-bold hover:underline">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="flex justify-between items-center p-4 bg-white rounded-xl shadow-sm">
        <button onClick={() => setPage(page - 1)} disabled={page === 0} className={`px-6 py-2 rounded-lg font-bold ${page === 0 ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white shadow-md'}`}>Prev</button>
        <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">Page {page + 1} of {totalPages || 1}</span>
        <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className={`px-6 py-2 rounded-lg font-bold ${page + 1 >= totalPages ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white shadow-md'}`}>Next</button>
      </div>
    </div>
  );
}