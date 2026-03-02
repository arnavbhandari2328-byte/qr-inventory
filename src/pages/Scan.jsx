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
    if (productId) fetchProductData();
    else {
      setLoading(false);
      fetchLocations(); // Still need locations for the manual entry if needed later
    }
  }, [productId]);

  const fetchLocations = async () => {
    const { data } = await supabase.from("locations").select("*");
    setLocations(data || []);
  };

  const fetchProductData = async () => {
    try {
      setLoading(true);
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("*")
        .eq("product_id", productId)
        .single();

      if (prodErr) throw prodErr;
      setProduct(prodData);
      await fetchLocations();
    } catch (err) {
      console.error("Error:", err.message);
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
        product_id: product.id,
        location_id: form.location_id,
        transaction_type: form.transaction_type,
        quantity: Number(form.quantity),
        party: form.party
      }]);

      if (error) throw error;
      alert("Success!");
      navigate("/scan"); // Reset for next scan
    } catch (err) {
      alert("Save failed!");
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center font-bold text-gray-500">Loading Product...</div>;

  /* --- VIEW 1: LOOKUP SCREEN --- */
  if (!productId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="mb-6 inline-block p-4 bg-blue-100 rounded-full">
            <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          </div>
          <h1 className="text-2xl font-black text-gray-800 mb-2">Inventory Scan</h1>
          <p className="text-gray-500 mb-8">Scan a QR code or enter ID below</p>
          
          <input 
            type="text" 
            placeholder="Enter Product ID (e.g. P101)" 
            className="w-full border-2 border-gray-200 p-4 rounded-2xl mb-4 text-center text-lg focus:border-blue-500 outline-none"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button 
            onClick={() => manualId && navigate(`/scan/${manualId.toUpperCase()}`)}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl text-xl active:scale-95 transition-transform"
          >
            Open Product
          </button>
        </div>
      </div>
    );
  }

  /* --- VIEW 2: PRODUCT NOT FOUND --- */
  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <h2 className="text-4xl mb-4">❌</h2>
        <h2 className="text-2xl font-bold text-red-600 mb-2">Not Found</h2>
        <p className="text-gray-500">ID "{productId}" does not exist.</p>
        <button onClick={() => navigate("/scan")} className="mt-8 bg-gray-800 text-white px-8 py-3 rounded-full font-bold">Try Again</button>
      </div>
    );
  }

  /* --- VIEW 3: MOBILE ENTRY FORM --- */
  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header Bar */}
      <div className="bg-white px-6 py-4 flex items-center shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate("/scan")} className="mr-4 p-2 bg-gray-100 rounded-full">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800 truncate leading-tight">{product.product_name}</h1>
          <p className="text-xs text-gray-400 font-mono uppercase tracking-widest">{product.product_id}</p>
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-md mx-auto">
        {/* Type Toggle */}
        <div className="bg-gray-200 p-1.5 rounded-2xl flex">
          <button 
            onClick={() => setForm({...form, transaction_type: 'inward'})}
            className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${form.transaction_type === 'inward' ? 'bg-green-500 text-white shadow-lg' : 'text-gray-500'}`}
          >
            INWARD (+)
          </button>
          <button 
            onClick={() => setForm({...form, transaction_type: 'outward'})}
            className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${form.transaction_type === 'outward' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-500'}`}
          >
            OUTWARD (-)
          </button>
        </div>

        {/* Input Fields */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-5">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Location</label>
            <select 
              className="w-full bg-gray-50 border-none p-4 rounded-xl mt-1 text-lg font-medium"
              value={form.location_id}
              onChange={(e) => setForm({...form, location_id: e.target.value})}
            >
              <option value="">Select Location</option>
              {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Quantity</label>
            <input 
              type="number" 
              placeholder="0.00"
              className="w-full bg-gray-50 border-none p-4 rounded-xl mt-1 text-2xl font-black text-blue-600"
              value={form.quantity}
              onChange={(e) => setForm({...form, quantity: e.target.value})}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Party / Note</label>
            <input 
              type="text" 
              placeholder="Optional"
              className="w-full bg-gray-50 border-none p-4 rounded-xl mt-1"
              value={form.party}
              onChange={(e) => setForm({...form, party: e.target.value})}
            />
          </div>
        </div>

        <button 
          onClick={handleSubmit}
          className={`w-full py-5 rounded-3xl text-white font-black text-xl shadow-xl active:scale-95 transition-transform ${form.transaction_type === 'inward' ? 'bg-green-600 shadow-green-200' : 'bg-red-600 shadow-red-200'}`}
        >
          CONFIRM {form.transaction_type.toUpperCase()}
        </button>
      </div>
    </div>
  );
}