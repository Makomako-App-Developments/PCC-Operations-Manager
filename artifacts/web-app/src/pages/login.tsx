import { useState, useEffect } from "react";
import { Leaf, Eye, EyeOff, Loader2, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("daniela.biaggio@poriruacity.govt.nz");
  const [password, setPassword] = useState("Porirua2024!");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inactivityBanner, setInactivityBanner] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("loggedOutReason") === "inactivity") {
      sessionStorage.removeItem("loggedOutReason");
      setInactivityBanner(true);
      const t = setTimeout(() => setInactivityBanner(false), 8000);
      return () => clearTimeout(t);
    }
  }, []);
  
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Error", description: "Please enter email and password", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      await login({ email, password });
    } catch (err: any) {
      toast({ 
        title: "Login failed", 
        description: err?.message || "Invalid credentials", 
        variant: "destructive" 
      });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen font-sans bg-[#f5f7f9]">
      <div
        className="hidden md:flex flex-col justify-between w-[420px] flex-shrink-0 p-10"
        style={{ background: `linear-gradient(160deg, #0f2a36 0%, #163e52 100%)` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#00AECD]">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">GardenOps</p>
            <p className="text-[11px] font-medium text-[#00AECD]">Porirua City Council</p>
          </div>
        </div>

        <div>
          <h1 className="text-white text-3xl font-black leading-snug mb-4">
            Urban ecology,<br />
            <span className="text-[#00AECD]">managed with care.</span>
          </h1>
          <p className="text-white/60 text-sm leading-relaxed">
            Asset tracking, maintenance scheduling and field operations — all in one place for the Porirua parks and gardens team.
          </p>
        </div>

        <p className="text-white/30 text-[11px]">© {new Date().getFullYear()} Porirua City Council</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm">
          <div className="flex md:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#00AECD]">
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base text-[#0f2a36]">GardenOps</span>
          </div>

          <h2 className="text-2xl font-black mb-1 text-[#0f2a36]">Welcome back</h2>
          <p className="text-gray-400 text-sm mb-8">Sign in to your account to continue</p>

          {inactivityBanner && (
            <div className="flex items-start gap-3 mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Session expired</p>
                <p className="text-xs text-amber-700 mt-0.5">You were logged out due to 30 minutes of inactivity.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:border-transparent"
                data-testid="input-email"
                required
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 pr-11 rounded-2xl border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:border-transparent"
                  data-testid="input-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg transition hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, #00AECD, #0097b2)` }}
              data-testid="btn-login"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>

          <p className="text-center text-[11px] text-gray-400 mt-6">
            Access is restricted to authorised Porirua City Council staff.
            <br />Contact your administrator if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
