import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin, Camera, Navigation, Leaf, CheckCircle2, ClipboardList,
  LayoutDashboard, CalendarDays, List, Menu, Upload, X, ClipboardCheck, Sprout, Layers, FileSpreadsheet, BarChart2
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List, label: "Asset Register" },
    { icon: CalendarDays, label: "Schedule" },
    { icon: ClipboardCheck, label: "Audits", id: "audits" },
    { icon: Sprout, label: "Infill Planting", id: "planting" },
    { icon: Layers, label: "Mulching",        id: "mulching" },
    { icon: FileSpreadsheet, label: "Specification", id: "spec" },
    { icon: BarChart2, label: "Reports", id: "reports" },
  ];
  return (
    <aside className="w-56 flex-shrink-0 bg-[#0f2a36] flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="bg-[#00AECD] rounded-lg px-3 py-2 text-center">
          <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
        </div>
        <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ icon: Icon, label, id }) => {
          const isActive = active === (id || label.toLowerCase());
          return (
            <div key={label} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "bg-[#00AECD] text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#00AECD] flex items-center justify-center text-white text-xs font-bold">BL</div>
          <div>
            <p className="text-white text-xs font-medium">Barry Lavakula</p>
            <p className="text-white/40 text-[10px]">Restoration Horticulturist</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PhotoUpload() {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600 font-medium">Drop photos here or click to upload</p>
      <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 10MB each</p>
      <div className="flex gap-2 mt-4 justify-center">
        {["Shrub overview", "Close-up detail"].map(label => (
          <div key={label} className="relative group">
            <div className="w-20 h-16 bg-green-100 rounded-lg border border-green-200 flex items-center justify-center">
              <Leaf className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-[9px] text-gray-500 mt-1 truncate w-20 text-center">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataCollectionForm() {
  const [standard, setStandard] = useState("High");
  const [type, setType] = useState("shrub-bed");
  const [condition, setCondition] = useState("2");
  const autoId = "GRD-2024-0847";

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <Sidebar active="form" />
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">New Garden Asset</h1>
            <p className="text-xs text-gray-400">Capture field data for a new amenity garden</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-[#00AECD]/10 text-[#00AECD] font-mono text-xs px-3 py-1 rounded-full border-0">
              ID: {autoId}
            </Badge>
            <Button variant="outline" size="sm">Save Draft</Button>
            <Button size="sm" style={{ background: BRAND }} className="text-white hover:opacity-90">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Submit
            </Button>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-8 py-6 grid grid-cols-3 gap-6">
          {/* Left column */}
          <div className="col-span-2 space-y-5">
            {/* Location */}
            <Card className="shadow-sm border-0 rounded-2xl">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4" style={{ color: BRAND }} /> Location Details
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Site Name *</Label>
                    <Input defaultValue="Aotea Lagoon Reserve" className="rounded-lg text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Street Address *</Label>
                    <Input defaultValue="Aotea Drive, Porirua" className="rounded-lg text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Location Description</Label>
                    <Input defaultValue="North entrance, adjacent to carpark" className="rounded-lg text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Area (m²) *</Label>
                    <Input defaultValue="142" type="number" className="rounded-lg text-sm" />
                  </div>
                </div>
                {/* GPS */}
                <div className="mt-4 p-3 bg-[#00AECD]/5 rounded-xl border border-[#00AECD]/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-4 h-4" style={{ color: BRAND }} />
                      <span className="text-xs font-medium text-gray-700">GPS Coordinates</span>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-[#00AECD] text-[#00AECD]">
                      <Navigation className="w-3 h-3 mr-1" /> Capture Location
                    </Button>
                  </div>
                  <div className="flex gap-4 mt-2">
                    <div className="flex-1">
                      <Label className="text-[10px] text-gray-400">Latitude</Label>
                      <Input defaultValue="-41.12847" className="rounded-lg text-xs h-8" readOnly />
                    </div>
                    <div className="flex-1">
                      <Label className="text-[10px] text-gray-400">Longitude</Label>
                      <Input defaultValue="174.84932" className="rounded-lg text-xs h-8" readOnly />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Garden Details */}
            <Card className="shadow-sm border-0 rounded-2xl">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Leaf className="w-4 h-4" style={{ color: BRAND }} /> Garden Details
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Garden Type *</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="rounded-lg text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Annuals","Roses & Perennials","Ornamental","Amenity","Rain Garden","Reveg","Bush","Tree Planter/Pits","Hedge"].map(t => (
                          <SelectItem key={t} value={t.toLowerCase().replace(/\s+/g, "-")}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Standard *</Label>
                    <Select value={standard} onValueChange={setStandard}>
                      <SelectTrigger className="rounded-lg text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["High", "Medium", "Low"].map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">% Plant Coverage</Label>
                    <Input defaultValue="78" type="number" className="rounded-lg text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Plants to Fill to 95%</Label>
                    <Input defaultValue="24" type="number" className="rounded-lg text-sm" />
                  </div>
                </div>

                {/* Condition grading */}
                <div className="mt-4">
                  <Label className="text-xs text-gray-500 mb-2 block">Condition Grading *</Label>
                  <div className="flex gap-2">
                    {[
                      { val: "1", label: "Excellent", color: "bg-green-500" },
                      { val: "2", label: "Good", color: "bg-lime-500" },
                      { val: "3", label: "Fair", color: "bg-yellow-500" },
                      { val: "4", label: "Poor", color: "bg-orange-500" },
                      { val: "5", label: "Very Poor", color: "bg-red-500" },
                    ].map(({ val, label, color }) => (
                      <button
                        key={val}
                        onClick={() => setCondition(val)}
                        className={`flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${condition === val ? `${color} text-white border-transparent` : "bg-white border-gray-200 text-gray-500"}`}
                      >
                        {val}<br /><span className="font-normal text-[9px]">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Comments */}
            <Card className="shadow-sm border-0 rounded-2xl">
              <CardContent className="p-5">
                <Label className="text-xs text-gray-500 mb-2 block">Comments / Notes</Label>
                <Textarea
                  className="rounded-lg text-sm resize-none"
                  rows={3}
                  defaultValue="Garden has some weed encroachment along northern edge. Several shrubs showing signs of drought stress. Recommend irrigation assessment."
                />
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Photos */}
            <Card className="shadow-sm border-0 rounded-2xl">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Camera className="w-4 h-4" style={{ color: BRAND }} /> Site Photos
                </h2>
                <PhotoUpload />
              </CardContent>
            </Card>

            {/* Standard Summary */}
            <Card className="shadow-sm border-0 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 text-white text-xs font-semibold flex items-center justify-between" style={{ background: BRAND }}>
                <span>{standard} Standard</span>
                <span className="text-white/70 font-normal cursor-pointer hover:text-white">View Spec →</span>
              </div>
              <CardContent className="p-4">
                {standard === "High" && <p className="text-xs text-gray-600">Showcase presentation. Annuals, Roses, and Ornamental gardens. Premium species maintained at peak condition with proactive pest and weed management.</p>}
                {standard === "Medium" && <p className="text-xs text-gray-600">Good civic presentation. Amenity, Rain Garden, Reveg, Tree Planters, and Hedges. Regular maintenance with seasonal colour and structured weed management.</p>}
                {standard === "Low" && <p className="text-xs text-gray-600">Ecological maintenance. Bush and naturalistic areas. Low intervention — safety, litter control, and plant health monitoring priority.</p>}
                <div className="mt-3 space-y-1.5">
                  {[
                    ["Weed Cover Max", standard === "High" ? "5%" : standard === "Medium" ? "10%" : "15%"],
                    ["Mulch Depth", standard === "High" ? "75–100 mm" : standard === "Medium" ? "75 mm" : "As required"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-semibold text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Progress */}
            <Card className="shadow-sm border-0 rounded-2xl">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-2 font-medium">Form completion</p>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: "75%", background: BRAND }} />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">75% complete</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
