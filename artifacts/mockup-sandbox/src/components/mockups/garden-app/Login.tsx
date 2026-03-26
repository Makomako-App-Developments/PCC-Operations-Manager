import { useState } from "react";
import { Eye, EyeOff, Leaf } from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

export function Login() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail]   = useState("daniela.biaggio@poriruacity.govt.nz");
  const [pw, setPw]         = useState("");

  return (
    <div className="flex min-h-screen font-sans" style={{ background: "#f5f7f9" }}>

      {/* ── Left panel — branding ── */}
      <div
        className="hidden md:flex flex-col justify-between w-[420px] flex-shrink-0 p-10"
        style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #163e52 100%)` }}
      >
        {/* Logo + wordmark */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: BRAND }}
          >
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">GardenOps</p>
            <p className="text-[11px] font-medium" style={{ color: BRAND }}>Porirua City Council</p>
          </div>
        </div>

        {/* Hero text */}
        <div>
          <h1 className="text-white text-3xl font-black leading-snug mb-4">
            Urban ecology,<br />
            <span style={{ color: BRAND }}>managed with care.</span>
          </h1>
          <p className="text-white/60 text-sm leading-relaxed">
            Asset tracking, maintenance scheduling and field operations — all in one place for the Porirua parks and gardens team.
          </p>
        </div>

        {/* Footer */}
        <p className="text-white/30 text-[11px]">© 2025 Porirua City Council</p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex md:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: BRAND }}>
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base" style={{ color: NAVY }}>GardenOps</span>
          </div>

          <h2 className="text-2xl font-black mb-1" style={{ color: NAVY }}>Welcome back</h2>
          <p className="text-gray-400 text-sm mb-8">Sign in to your account to continue</p>

          {/* SSO */}
          <button className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-2xl py-3 mb-6 bg-white hover:bg-gray-50 transition text-sm font-medium text-gray-700 shadow-sm">
            <svg width="18" height="18" viewBox="0 0 21 21">
              <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
              <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Continue with Microsoft
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400 font-medium">or sign in with email</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Form */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": BRAND } as React.CSSProperties}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Password
                </label>
                <button className="text-xs font-medium" style={{ color: BRAND }}>
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 pr-11 rounded-2xl border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ "--tw-ring-color": BRAND } as React.CSSProperties}
                />
                <button
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg transition hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${BRAND}, #0097b2)` }}
          >
            Sign In
          </button>

          <p className="text-center text-[11px] text-gray-400 mt-6">
            Access is restricted to authorised Porirua City Council staff.
            <br />Contact your administrator if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
