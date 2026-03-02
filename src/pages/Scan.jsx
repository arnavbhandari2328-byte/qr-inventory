import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { Html5Qrcode } from "html5-qrcode"; // ✅ Switched to the core class for more control

export default function Scan() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const scannerRef = useRef(null);

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

  // 📸 AUTOMATIC CAMERA START
  useEffect(() => {
    if (!productId) {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const config = { fps: 15, qrbox: { width: 250, height: 250 } };

      // ✅ Force the back camera ('environment') to avoid questions
      html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
          html5QrCode.stop().then(() => {
            navigate(`/scan/${encodeURIComponent(decodedText)}`);
          });
        },
        () => {} // Silent ignore of scan failures
      ).catch(err => console.error("Camera start error:", err));

      return () => {
        if (scannerRef.current?.isScanning) {
          scannerRef.current.stop().catch(e => console.error(e));
        }
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

  /* --- LOOKUP / AUTOMATIC SCANNER VIEW --- */
  if (!productId) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center">
        {/* Full screen camera feel */}
        <div id="reader" className="w-full h-[60vh] bg-black"></div>
        
        <div className="w-full flex-1 bg-white rounded-t-[3rem] -mt-10 p-8 shadow-2xl z-10">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>
          <h1 className="text-xl font-black text-center mb-6 text-gray-800">Quick Scan</h1>
          
          <div className="space-y-4">
            <input 
              className="w-full p-4 border-2 border-gray-100 rounded-2xl text-center font-mono uppercase focus:border-blue-500 transition-all outline-none"
              placeholder="ENTER PRODUCT ID"
              value={manualId}
              onChange={e => setManualId(e.target.value)}
            />
            <button 
              onClick={() => manualId && navigate(`/scan/${encodeURIComponent(manualId.toUpperCase())}`)}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              Manual Lookup
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-20 text-center font-bold text-gray-400">Fetching Product Details...</div>;

  if (!product) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <div className="bg-red-50 p-6 rounded-full mb-4">
        <span className="text-4xl">⚠️</span>
      </div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Item Not Recognized</h2>
      <p className="text-gray-400 text-sm mb-8 leading-relaxed">The ID <span className="font-mono font-bold text-red-500">{decodeURIComponent(productId)}</span> does not exist in your database.</p>
      <button onClick={() => navigate("/scan")} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold shadow-lg">Try Again</button>
    </div>
  );

  /* --- TRANSACTION ENTRY VIEW --- */
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white p-5 shadow-sm flex items-center sticky top-0 z-20">
        <button onClick={() => navigate("/scan")} className="mr-4 p-2 bg-gray-100 rounded-full text-lg">←</button>
        <div className="overflow-hidden">
          <h1 className="font-black text-gray-800 truncate">{product.product_name}</h1>
          <p className="text-xs text-blue-600 font-mono font-bold truncate">{product.product_id}</p>
        </div>
      </div>

      <div className="p-5 max-w-md mx-auto space-y-6">
        <div className="bg-gray-200 p-1.5 rounded-2xl flex">
          <button onClick={() => setForm({...form, transaction_type: 'inward'})} className={`flex-1 py-4 rounded-xl font-black text-xs transition-all ${form.transaction_type === 'inward' ? 'bg-green-500 text-white shadow-md' : 'text-gray-400'}`}>INWARD (+)</button>
          <button onClick={() => setForm({...form, transaction_type: 'outward'})} className={`flex-1 py-4 rounded-xl font-black text-xs transition-all ${form.transaction_type === 'outward' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400'}`}>OUTWARD (-)</button>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block ml-1">Godown / Location</label>
            <select className="w-full bg-gray-50 p-4 rounded-2xl border-none outline-none font-bold text-gray-700" value={form.location_id} onChange={e => setForm({...form, location_id: e.target.value})}>
              <option value="">Select Location</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block ml-1">Quantity</label>
            <input type="number" className="w-full bg-gray-50 p-4 rounded-2xl text-2xl font-black outline-none text-blue-600" placeholder="0" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block ml-1">Party Name</label>
            <input className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-medium" placeholder="Vendor/Customer Name" value={form.party} onChange={e => setForm({...form, party: e.target.value})} />
          </div>
        </div>

        <button onClick={handleSubmit} className={`w-full py-5 rounded-3xl text-white font-black text-xl shadow-xl transition-all active:scale-95 ${form.transaction_type === 'inward' ? 'bg-green-600 shadow-green-100' : 'bg-red-600 shadow-red-100'}`}>
          RECORD {form.transaction_type.toUpperCase()}
        </button>
      </div>
    </div>
  );
}