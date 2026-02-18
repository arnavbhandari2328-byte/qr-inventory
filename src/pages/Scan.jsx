import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";

export default function Scan() {
  const { productId } = useParams();

  const [product, setProduct] = useState(null);
  const [locations, setLocations] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [form, setForm] = useState({
    type: "inward",
    location_id: "",
    quantity: "",
    party: ""
  });

  useEffect(() => {
    if (productId) load();
  }, [productId]);

  async function load() {
    // 1️⃣ find product using readable code (P001 etc)
    const { data: productData } = await supabase
      .from("products")
      .select("*")
      .eq("product_id", productId)
      .single();

    if (!productData) return;

    setProduct(productData);

    // 2️⃣ load locations
    const { data: loc } = await supabase.from("locations").select("*");
    setLocations(loc || []);

    // default location
    if (loc && loc.length) {
      setForm((f) => ({ ...f, location_id: loc[0].id }));
    }

    // 3️⃣ load previous transactions using REAL DB ID
    const { data: trans } = await supabase
      .from("transactions")
      .select("*, locations(name)")
      .eq("product_id", productData.id)
      .order("created_at", { ascending: false });

    setTransactions(trans || []);
  }

  async function submit(e) {
    e.preventDefault();

    if (!form.quantity) return alert("Enter quantity");

    await supabase.from("transactions").insert([
      {
        product_id: product.id, // IMPORTANT: DB id not code
        location_id: form.location_id,
        transaction_type: form.type,
        quantity: Number(form.quantity),
        party: form.party
      }
    ]);

    setForm({ ...form, quantity: "", party: "" });
    load();
  }

  if (!product) return <div className="p-10 text-lg">Product not found</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded p-6">
        <h1 className="text-3xl font-bold">{product.product_name}</h1>
        <p className="text-gray-500">Code: {product.product_id}</p>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="bg-white shadow rounded p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="border p-2 rounded"
          >
            <option value="inward">Inward (Stock In)</option>
            <option value="outward">Outward (Stock Out)</option>
          </select>

          <select
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            className="border p-2 rounded"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Quantity"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="border p-2 rounded"
          />

          <input
            placeholder="Party / Remarks"
            value={form.party}
            onChange={(e) => setForm({ ...form, party: e.target.value })}
            className="border p-2 rounded"
          />
        </div>

        <button className="bg-blue-600 text-white px-6 py-2 rounded">
          Save Transaction
        </button>
      </form>

      {/* History */}
      <div className="bg-white shadow rounded p-6">
        <h2 className="text-xl font-semibold mb-4">History</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th>Date</th>
              <th>Type</th>
              <th>Location</th>
              <th>Qty</th>
              <th>Party</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b">
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td className={t.transaction_type === "inward" ? "text-green-600" : "text-red-600"}>
                  {t.transaction_type}
                </td>
                <td>{t.locations?.name}</td>
                <td>{t.quantity}</td>
                <td>{t.party}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
