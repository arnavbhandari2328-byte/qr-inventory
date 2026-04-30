import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";

const ADMIN_EMAILS = [
  "niveemetals@gmail.com",
  "vishalom999@gmail.com",
  "vikrambhandari7171@gmail.com",
];

export default function Transactions() {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
    checkUserRole(); 
    fetchDropdowns();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [page]);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (ADMIN_EMAILS.includes(user?.email)) {
      setIsAdmin(true);
    }
  };

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
      console.error("Failed fetching transactions", err);
    }
  }

  // ✅ FIXED IST FORMATTER: Safely parses Supabase DB timestamps into Indian Standard Time
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

  const handleSave = async () => {
    if (!form.product_id || !form.location_id || !form.quantity) {
      alert("Please fill required fields (Product, Location, Quantity)");
      return;
    }

    try {
      // ✅ FIX: Pull the active employee email from memory instead of relying on the slow auth check
      const activeEmployee = localStorage.getItem("userEmail") || "Unknown User";

      const payload = {
        product_id: form.product_id,
        location_id: form.location_id,
        transaction_type: form.transaction_type,
        quantity: Number(form.quantity),
        party: form.party,
        created_by_email: activeEmployee // ✅ FIX: Successfully maps the employee email to the database
      };

      if (editingId) {
        await supabase.from("transactions").update(payload).eq("id", editingId);
      } else {
        await supabase.from("transactions").insert([payload]);
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
    if (!isAdmin) return alert("Admin only delete access.");
    if (!window.confirm("Delete transaction?")) return;
    await supabase.from("transactions").delete().eq("id", id);
    fetchTransactions();
  };

  const exportToExcel = async () => {
    try {
      const { data: allTrans } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      const exportData = (allTrans || []).map((t) => ({
        Date_IST: formatIST(t.created_at),
        Product: products.find((p) => p.id === t.product_id)?.product_name || "",
        Type: t.transaction_type.toUpperCase(),
        Quantity: t.quantity,
        Location: locations.find((l) => l.id === t.location_id)?.name || "",
        Party: t.party || "-", 
        Employee: t.created_by_email || "System" 
      }));

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
      <div className="bg-white shadow rounded p-6 mb-6 space-y-4 border border-gray-100">
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
          <button onClick={handleSave} className={`text-white px-8 py-2 rounded font-bold transition-all ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {editingId ? "Update Entry" : "Save Entry"}
          </button>
          {editingId && <button onClick={cancelEdit} className="bg-gray-400 text-white px-6 py-2 rounded">Cancel</button>}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="border p-3 rounded w-80 shadow-sm outline-none" />
        <button onClick={exportToExcel} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg transition-all">Export to Excel</button>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white shadow rounded overflow-x-auto mb-6">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Date (IST)</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Product</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Type</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Qty</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Location</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Party</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Employee</th>
              <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-4 text-sm text-gray-600 whitespace-nowrap font-medium">
                  {formatIST(t.created_at)}
                 </td>
                <td className="p-4 font-bold text-gray-800">{products.find(p => p.id === t.product_id)?.product_name}</td>
                <td className={`p-4 font-black ${t.transaction_type === "inward" ? "text-green-600" : "text-red-600"}`}>
                  {t.transaction_type.toUpperCase()}
                </td>
                <td className="p-4 font-mono font-bold">{t.quantity}</td>
                <td className="p-4 text-sm text-gray-600 font-semibold">{locations.find(l => l.id === t.location_id)?.name}</td>
                <td className="p-4 text-sm font-semibold text-gray-700">{t.party || "-"}</td>
                <td className="p-4 text-sm font-semibold text-blue-700">{t.created_by_email || "System"}</td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => handleEditClick(t)} className="text-blue-600 font-bold hover:underline">Edit</button>
                  {isAdmin && <button onClick={() => handleDelete(t.id)} className="text-red-500 font-bold hover:underline">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <button onClick={() => setPage(page - 1)} disabled={page === 0} className={`px-6 py-2 rounded-lg font-bold transition-all ${page === 0 ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white shadow-md'}`}>Prev</button>
        <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">Page {page + 1} of {totalPages || 1}</span>
        <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className={`px-6 py-2 rounded-lg font-bold transition-all ${page + 1 >= totalPages ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white shadow-md'}`}>Next</button>
      </div>
    </div>
  );
}