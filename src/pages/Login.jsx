import { useState } from "react";
import { supabase } from "../supabase";
import { getDeviceFingerprint } from "../utils/deviceSecurity";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // 1. Standard Supabase Sign-in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    try {
      const user = data.user;

      // 2. Identify the device currently in your hand
      const currentID = await getDeviceFingerprint();

      // 3. Fetch profile (Make sure to select email and the ID array)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('allowed_device_id, email')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      // 4. THE MULTI-DEVICE SECURITY CHECK
      // Ensure we treat the data as an array even if it's empty
      const allowedIDs = profile.allowed_device_id || [];
      const isAdmin = profile.email === 'niveemetals@gmail.com';
      const deviceLimit = isAdmin ? 2 : 1;

      // Check if this device is already registered
      if (allowedIDs.includes(currentID)) {
        console.log("Device verified. Access granted.");
      } 
      // If it's a new device, check if there's room to add it
      else if (allowedIDs.length < deviceLimit) {
        const newIDList = [...allowedIDs, currentID];

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ allowed_device_id: newIDList })
          .eq('id', user.id);

        if (updateError) throw updateError;
        
        alert(`New device registered! Slot ${newIDList.length}/${deviceLimit} used.`);
      } 
      // If no slots are left, block them
      else {
        await supabase.auth.signOut();
        alert(`ACCESS DENIED: You have reached your limit of ${deviceLimit} device(s).`);
        setLoading(false);
        return;
      }

      // 5. SUCCESS: Redirect to Dashboard
      window.location.href = "/dashboard";

    } catch (err) {
      console.error("Security check failed:", err);
      alert("Device verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-8 shadow-2xl rounded-2xl w-96 space-y-6 border border-gray-100">
        <div className="text-center">
          <h2 className="text-3xl font-black text-[#0a2a5e] tracking-tight">System Login</h2>
          <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-bold">Nivee Metal Products</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-gray-200 border p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="admin@niveemetal.com"
              required
            />
          </div>

          <div>
            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-gray-200 border p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="••••••••"
              required
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-[#0a2a5e] text-white font-bold py-3 rounded-xl hover:bg-blue-800 transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Secure Sign In"}
        </button>
        
        <div className="flex items-center justify-center gap-2">
           <div className="h-px w-8 bg-gray-200"></div>
           <span className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">Device Protected</span>
           <div className="h-px w-8 bg-gray-200"></div>
        </div>
      </form>
    </div>
  );
}