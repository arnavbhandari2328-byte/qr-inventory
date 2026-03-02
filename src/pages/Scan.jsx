import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { Html5QrcodeScanner } from "html5-qrcode";

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

  // 📸 Initialize Camera Scanner (Only on the lookup screen)
  useEffect(() => {
    if (!productId) {
      const scanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      });

      scanner.render((decodedText) => {
        scanner.clear();
        // ✅ encodeURIComponent handles characters like / and "
        navigate(`/scan/${encodeURIComponent(decodedText)}`);
      }, () => {});

      return () => {
        scanner.clear().catch(err => console.error("Scanner cleanup error", err));
      };
    }
  }, [productId, navigate]);

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
      // ✅ decodeURIComponent turns %2F back into /
      const decodedId = decodeURIComponent(productId);
      
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("product_id", decodedId)
        .single();

      if (error || !data) throw new Error("Not found");
      setProduct(data);
    } catch (err) {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.location_id || !form.quantity) return alert("Fill all fields");
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
      navigate("/scan");
    } catch (err) {
      alert("Save failed!");
    }
  };

  /* --- LOOKUP / SCANNER VIEW --- */
  if (!productId) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex flex-col items-center">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6 mt-4">
          <h1 className="text-xl font-black text-center mb-4">Nivee Metal Scanner</h1>
          
          {/* CAMERA FEED AREA */}
          <div id="reader" className="overflow-hidden rounded-2xl border-2 border-gray-100"></div>
          
          <div className="mt-6 space-y-3">
            <p className="text-center text-xs font-bold text-gray-400 uppercase">Manual Entry</p>
            <input 
              className="w-full p-4 border-2 border-gray-100 rounded-2xl text-center font-mono"
              placeholder="NM-PPR-304..."
              value={manualId}
              onChange={e => setManualId(e.target.value)}
            />
            <button 
              onClick={() => manualId && navigate(`/scan/${encodeURIComponent(manualId)}`)}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              Open Product
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-20 text-center font-bold text-gray-400">Searching...</div>;

  if (!product) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <h2 className="text-2xl font-bold text-red-500 mb-2">Not Found</h2>
      <p className="text-gray-500 text-sm mb-6">ID: {decodeURIComponent(productId)}</p>
      <button onClick={() => navigate("/scan")} className="bg-gray-800 text-white px-8 py-3 rounded-full">Try Again</button>
    </div>
  );

  /* --- TRANSACTION ENTRY VIEW --- */
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white p-4 shadow-sm flex items-center sticky top-0 z-20">
        <button onClick={() => navigate("/scan")} className="mr-4 p-2 bg-gray-100 rounded-full text-lg">←</button>
        <div className="overflow-hidden">
          <h1 className="font-bold truncate">{product.product_name}</h1>
          <p className="text-xs text-blue-600 font-mono truncate">{product.product_id}</p>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-6">
        <div className="bg-gray-200 p-1 rounded-2xl flex">
          <button onClick={() => setForm({...form, transaction_type: 'inward'})} className={`flex-1 py-4 rounded-xl font-bold ${form.transaction_type === 'inward' ? 'bg-green-500 text-white shadow' : 'text-gray-500'}`}>INWARD (+)</button>
          <button onClick={() => setForm({...form, transaction_type: 'outward'})} className={`flex-1 py-4 rounded-xl font-bold ${form.transaction_type === 'outward' ? 'bg-red-500 text-white shadow' : 'text-gray-500'}`}>OUTWARD (-)</button>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
          <select className="w-full bg-gray-50 p-4 rounded-xl border-none outline-none" value={form.location_id} onChange={e => setForm({...form, location_id: e.target.value})}>
            <option value="">Select Godown/Office</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="number" className="w-full bg-gray-50 p-4 rounded-xl text-xl font-bold outline-none" placeholder="Quantity" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
          <input className="w-full bg-gray-50 p-4 rounded-xl outline-none" placeholder="Party / Reference" value={form.party} onChange={e => setForm({...form, party: e.target.value})} />
        </div>

        <button onClick={handleSubmit} className={`w-full py-5 rounded-3xl text-white font-black text-xl shadow-lg transition-colors ${form.transaction_type === 'inward' ? 'bg-green-600' : 'bg-red-600'}`}>
          CONFIRM {form.transaction_type.toUpperCase()}
        </button>
      </div>
    </div>
  );
}