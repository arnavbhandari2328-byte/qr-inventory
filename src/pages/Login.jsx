import { useState } from "react";
import { supabase } from "../supabase";
import { getDeviceFingerprint } from "../utils/deviceSecurity"; // Import the security utility

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

      // 2. Identify the phone currently in use
      const currentPhoneID = await getDeviceFingerprint();

      // 3. Check the database for the "Approved" phone ID
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('allowed_device_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error("Profile fetch error:", profileError);
        setLoading(false);
        return;
      }

      // 4. THE DEVICE LOCK SECURITY CHECK
      if (!profile.allowed_device_id) {
        // FIRST TIME LOGIN: Bind this account to THIS phone/browser
        await supabase
          .from('profiles')
          .update({ allowed_device_id: currentPhoneID })
          .eq('id', user.id);
        
        alert("Device Registered! Your account is now locked to this specific phone.");
      } 
      else if (profile.allowed_device_id !== currentPhoneID) {
        // UNAUTHORIZED DEVICE: Force sign out immediately
        await supabase.auth.signOut();
        alert("ACCESS DENIED: This device is not authorized for this account. Contact your Admin.");
        setLoading(false);
        return;
      }

      // 5. SUCCESS: Proceed to Dashboard
      // (Supabase Auth listeners will usually handle redirection, or you can use a navigate hook)
      console.log("Login successful and device verified.");

    } catch (err) {
      console.error("Security check failed:", err);
      alert("An error occurred during the security check.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">
      <form onSubmit={handleLogin} className="bg-white p-8 shadow-xl rounded-xl w-96 space-y-6">
        <h2 className="text-3xl font-bold text-center text-[#0a2a5e]">System Login</h2>
        
        <div>
          <label className="block text-gray-600 text-sm mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border p-2 rounded focus:outline-none focus:border-blue-500"
            placeholder="employee@niveemetal.com"
            required
          />
        </div>

        <div>
          <label className="block text-gray-600 text-sm mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border p-2 rounded focus:outline-none focus:border-blue-500"
            placeholder="••••••••"
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Verifying Device..." : "Sign In"}
        </button>
        
        <p className="text-[10px] text-center text-gray-400 uppercase tracking-widest">
          Secure Device-Locked Session
        </p>
      </form>
    </div>
  );
}