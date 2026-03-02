import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";

export default function Scan() {
  const { productId } = useParams();
  const navigate = useNavigate();

  const [manualId, setManualId] = useState("");
  const [product, setProduct] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    location_id: "",
    transaction_type: "inward",
    quantity: "",
    party: ""
  });

  useEffect(() => {
    fetchLocations();
    if (productId) fetchProductData();
    else setLoading(false);
  }, [productId]);

  const fetchLocations = async () => {
    const { data } = await supabase.from("locations").select("*");
    setLocations(data || []);
  };

  const fetchProductData = async () => {
    try {
      setLoading(true);
      // ✅ We search by the alphanumeric product_id and make it case-insensitive
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("*")
        .ilike("product_id", productId) // ilike makes it case-insensitive
        .single();

      if (prodErr || !prodData) throw new Error("Product not found");
      
      setProduct(prodData);
    } catch (err) {
      console.error("Lookup Error:", err.message);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.location_id || !form.quantity) {
      alert("Please enter Location and Quantity!");
      return;
    }

    try {
      const { error } = await supabase.from("transactions").insert([{
        product_id: product.id, // ✅ This uses the internal DB UUID required for the link
        location_id: form.location_id,
        transaction_type: form.transaction_type,
        quantity: Number(form.quantity),
        party: form.party
      }]);

      if (error) throw error;
      alert("Transaction Saved!");
      navigate("/scan"); 
    } catch (err) {
      alert("Save failed! Make sure you selected a location.");
    }
  };

  if (loading) return <div className="p-10 text-center font-bold">Searching Database...</div>;

  if (!productId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center">
          <h1 className="text-2xl font-black mb-6">Inventory Scan</h1>
          <input 
            type="text" 
            placeholder="Enter ID (e.g. SS-RB-020)" 
            className="w-full border-2 p-4 rounded-2xl mb-4 text-center uppercase"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button 
            onClick={() => manualId && navigate(`/scan/${manualId}`)}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl"
          >
            Find Product
          </button>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <h2 className="text-2xl font-bold text-red-600">Product Not Found</h2>
        <p className="text-gray-500">No product matches ID: {productId}</p>
        <button onClick={() => navigate("/scan")} className="mt-8 bg-gray-800 text-white px-8 py-2 rounded-full">Try Again</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white px-6 py-4 flex items-center shadow-sm sticky top-0">
        <button onClick={() => navigate("/scan")} className="mr-4 p-2 bg-gray-100 rounded-full">←</button>
        <div>
          <h1 className="text-xl font-bold">{product.product_name}</h1>
          <p className="text-xs text-blue-600 font-mono">{product.product_id}</p>
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-md mx-auto">
        <div className="bg-gray-200 p-1.5 rounded-2xl flex">
          <button 
            onClick={() => setForm({...form, transaction_type: 'inward'})}
            className={`flex-1 py-4 rounded-xl font-bold ${form.transaction_type === 'inward' ? 'bg-green-500 text-white shadow' : 'text-gray-500'}`}
          >
            INWARD (+)
          </button>
          <button 
            onClick={() => setForm({...form, transaction_type: 'outward'})}
            className={`flex-1 py-4 rounded-xl font-bold ${form.transaction_type === 'outward' ? 'bg-red-500 text-white shadow' : 'text-gray-500'}`}
          >
            OUTWARD (-)
          </button>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm space-y-5">
          <select 
            className="w-full bg-gray-50 p-4 rounded-xl text-lg"
            value={form.location_id}
            onChange={(e) => setForm({...form, location_id: e.target.value})}
          >
            <option value="">Select Location</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>

          <input 
            type="number" 
            placeholder="Quantity"
            className="w-full bg-gray-50 p-4 rounded-xl text-2xl font-black"
            value={form.quantity}
            onChange={(e) => setForm({...form, quantity: e.target.value})}
          />

          <input 
            type="text" 
            placeholder="Party Name / Notes"
            className="w-full bg-gray-50 p-4 rounded-xl"
            value={form.party}
            onChange={(e) => setForm({...form, party: e.target.value})}
          />
        </div>

        <button 
          onClick={handleSubmit}
          className={`w-full py-5 rounded-3xl text-white font-black text-xl shadow-lg ${form.transaction_type === 'inward' ? 'bg-green-600' : 'bg-red-600'}`}
        >
          CONFIRM {form.transaction_type.toUpperCase()}
        </button>
      </div>
    </div>
  );
}