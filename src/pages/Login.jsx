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
      const currentID = await getDeviceFingerprint();

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('allowed_device_id, email')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const rawIDs = profile.allowed_device_id || [];
      const allowedIDs = rawIDs.filter(id => id !== null && id !== "null");
      const userEmail = profile.email;
      
      let deviceLimit = 1; 
      if (userEmail === 'niveemetals@gmail.com') {
        deviceLimit = 4; 
      } else if (userEmail === 'pursingh1@gmail.com') {
        deviceLimit = 2; 
      }

      if (allowedIDs.includes(currentID)) {
        console.log("Device verified.");
      } 
      else if (allowedIDs.length < deviceLimit) {
        const newIDList = [...allowedIDs, currentID];
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ allowed_device_id: newIDList })
          .eq('id', user.id);

        if (updateError) throw updateError;
        alert(`New device registered! Slot ${newIDList.length}/${deviceLimit} occupied.`);
      } 
      else {
        await supabase.auth.signOut();
        alert(`ACCESS DENIED: All ${deviceLimit} device slots are full.`);
        setLoading(false);
        return;
      }

      window.location.href = "/dashboard";

    } catch (err) {
      console.error("Security verification failed:", err);
      alert("Device security check failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#0a2a5e 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      <form onSubmit={handleLogin} className="relative bg-white p-10 shadow-2xl rounded-[2.5rem] w-full max-w-md space-y-8 border border-slate-100">
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-black text-[#0a2a5e] tracking-tighter uppercase italic">System Login</h2>
          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-[0.4em]">Nivee Metal Products</p>
        </div>
        <div className="space-y-5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-50 border-none p-4 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
            placeholder="Work Email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-50 border-none p-4 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
            placeholder="Password"
            required
          />
        </div>
        <button type="submit" disabled={loading} className="w-full bg-[#0a2a5e] text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50">
          {loading ? "Securing Session..." : "Authorize & Sign In"}
        </button>
        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest text-center">Multi-Tier Device Protection Active</p>
      </form>
    </div>
  );
}