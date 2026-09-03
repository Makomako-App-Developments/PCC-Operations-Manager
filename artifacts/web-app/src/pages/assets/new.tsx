import { useListTeams, getListTeamsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Droplets, Leaf } from "lucide-react";
import BoundaryEditor, { type GeoPolygon } from "@/components/BoundaryEditor";
import { DEPARTMENTS, DEPARTMENT_VALUES, departmentRule, STORMWATER_OPTIONS } from "@workspace/asset-definitions";

const BRAND = "#00AECD";

const assetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  department: z.enum(DEPARTMENT_VALUES),
  siteType: z.enum(["park","street"]).optional(),
  gardenType: z.enum(["annuals","roses_perennials","ornamental","amenity","rain_garden","reveg","bush","tree_planter_pits","hedge"]).optional(),
  standard: z.enum(["high","medium","low"]).optional(),
  areaM2: z.coerce.number().optional(),
  serviceTimeMins: z.coerce.number().min(1, "Service time must be at least 1"),
  frequency: z.enum(["weekly","fortnightly","monthly","bimonthly","quarterly"]),
  departmentDetails: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  teamId: z.string().optional(),
  ward: z.enum(["eastern","northern","western"]).optional(),
  suburb: z.string().optional(),
  streetAddress: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  notes: z.string().optional(),
  knownHazards: z.string().optional(),
}).superRefine((data, ctx) => {
  const rule = departmentRule(data.department);
  if (data.department === "horticulture" && !data.gardenType) {
    ctx.addIssue({ code: "custom", path: ["gardenType"], message: "Garden type is required" });
  }
  if (data.department === "horticulture" && !data.standard) {
    ctx.addIssue({ code: "custom", path: ["standard"], message: "Standard is required" });
  }
  if (data.department !== "horticulture" && rule.specificationRequired && !data.departmentDetails[rule.specificationKey]) {
    ctx.addIssue({ code: "custom", path: ["departmentDetails"], message: `${rule.specificationLabel} is required` });
  }
  if (rule.areaRequired && (!data.areaM2 || data.areaM2 <= 0)) {
    ctx.addIssue({ code: "custom", path: ["areaM2"], message: `${rule.areaLabel} must be greater than 0` });
  }
});

const stormwaterSchema = z.object({
  globalId: z.string().min(1, "Global ID is required"),
  name: z.string().min(1, "Name is required"),
  suburb: z.string().optional(),
  streetAddress: z.string().optional(),
  description: z.string().optional(),
  teamId: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  departmentDetails: z.object({
    placemarkId: z.string().optional(),
    contractor: z.string().min(1, "Contractor is required"),
    assetType: z.string().min(1, "Asset Type is required"),
    priority: z.string().min(1, "Priority is required"),
    hotspot: z.string().min(1, "Hotspot is required"),
  }),
});

export default function NewAsset() {
  const [creationMode, setCreationMode] = useState<"select" | "horticulture" | "stormwater">("select");

  if (creationMode === "select") {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
        <header className="bg-white border-b px-8 py-4 flex items-center gap-4 sticky top-0 z-10 flex-shrink-0">
          <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Create Asset</h1>
            <p className="text-xs text-gray-400">Choose the type of asset to add to the registry</p>
          </div>
        </header>
        <div className="flex-1 overflow-auto flex items-center justify-center p-8">
          <div className="max-w-3xl w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button onClick={() => setCreationMode("horticulture")} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:border-[#00AECD] hover:shadow-md transition-all text-left group">
                 <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                   <Leaf className="w-6 h-6" />
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Parks & Horticulture</h3>
                 <p className="text-sm text-gray-500">Gardens, mowing, sportsfields, and general maintenance assets with scheduled service frequencies.</p>
              </button>

              <button onClick={() => setCreationMode("stormwater")} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:border-[#00AECD] hover:shadow-md transition-all text-left group">
                 <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                   <Droplets className="w-6 h-6" />
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Stormwater</h3>
                 <p className="text-sm text-gray-500">Inlets, outlets, culverts, and other water infrastructure managed as a register.</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return creationMode === "horticulture"
    ? <HorticultureForm onBack={() => setCreationMode("select")} />
    : <StormwaterForm onBack={() => setCreationMode("select")} />;
}

function HorticultureForm({ onBack }: { onBack: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [boundary, setBoundary] = useState<GeoPolygon | null>(null);

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});

  const form = useForm<z.infer<typeof assetSchema>>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      department: "horticulture",
      gardenType: "amenity",
      standard: "medium",
      areaM2: 0,
      serviceTimeMins: 30,
      frequency: "monthly",
      departmentDetails: {},
    }
  });

  const [submitting, setSubmitting] = useState(false);
  const selectedDepartment = form.watch("department");
  const selectedRule = departmentRule(selectedDepartment);

  const onSubmit = async (data: z.infer<typeof assetSchema>) => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...data };
      payload.departmentDetails = data.department === "horticulture" ? null : data.departmentDetails;
      if (data.department !== "horticulture") {
        payload.gardenType = null;
        payload.standard = null;
      }
      payload.areaM2 = data.areaM2 && data.areaM2 > 0 ? data.areaM2 : null;
      if (boundary) payload.boundary = boundary;
      const r = await fetch("/api/assets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error((err as Record<string, string>).error ?? "Failed to create asset");
      }
      const created = await r.json() as { name: string };
      toast({ title: "Asset Created", description: `${created.name} added to register.` });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      setLocation("/assets");
    } catch (err: unknown) {
      toast({
        title: "Failed to create",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center gap-4 sticky top-0 z-10 flex-shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Create Asset</h1>
          <p className="text-xs text-gray-400">Add a new site to the registry</p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="border-b pb-2 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Identification</h3>
                  </div>

                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Site Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Aotea Lagoon Entry" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="department" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Department / Function</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("departmentDetails", {});
                        if (value === "horticulture") {
                          form.setValue("gardenType", "amenity");
                          form.setValue("standard", "medium");
                        } else {
                          form.setValue("gardenType", undefined);
                          form.setValue("standard", undefined);
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEPARTMENTS.filter(d => d.value !== "stormwater").map(({ value, label }) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className={`grid gap-4 ${selectedDepartment === "horticulture" ? "grid-cols-3" : "grid-cols-2"}`}>
                    <FormField control={form.control} name="siteType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Site Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="park">Park</SelectItem>
                            <SelectItem value="street">Street</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {selectedDepartment === "horticulture" ? <FormField control={form.control} name="gardenType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">{selectedRule.specificationLabel}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedRule.specificationOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} /> : selectedRule.specificationOptions.length > 0 ? <FormField control={form.control} name={"departmentDetails" as any} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">{selectedRule.specificationLabel}</FormLabel>
                        <Select value={String(field.value?.[selectedRule.specificationKey] ?? "")} onValueChange={value => field.onChange({ ...(field.value ?? {}), [selectedRule.specificationKey]: value })}>
                          <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {selectedRule.specificationOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} /> : null}

                    {selectedDepartment === "horticulture" && <FormField control={form.control} name="standard" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Standard</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border-b pb-2 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Service Details</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="areaM2" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">{selectedRule.areaLabel}{selectedRule.areaRequired ? "" : " (optional)"}</FormLabel>
                        <FormControl><Input type="number" min="0" {...field} className="h-10" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="serviceTimeMins" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">{selectedRule.serviceTimeLabel}</FormLabel>
                        <FormControl><Input type="number" {...field} className="h-10" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="frequency" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">{selectedRule.frequencyLabel}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="fortnightly">Fortnightly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="bimonthly">Bi-Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="teamId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Assigned Team</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Select Team" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamsData?.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="pt-4 space-y-6 border-t">
                <div className="border-b pb-2 mb-4">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Location</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField control={form.control} name="ward" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Ward</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Select Ward" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="eastern">Eastern</SelectItem>
                          <SelectItem value="northern">Northern</SelectItem>
                          <SelectItem value="western">Western</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="suburb" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Suburb / Area</FormLabel>
                      <FormControl><Input placeholder="e.g. Porirua CBD" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Map Boundary</p>
                  <BoundaryEditor
                    initialBoundary={boundary}
                    initialLat={form.getValues("lat")}
                    initialLng={form.getValues("lng")}
                    onChange={(b, lat, lng) => {
                      setBoundary(b);
                      if (lat != null) form.setValue("lat", lat);
                      if (lng != null) form.setValue("lng", lng);
                    }}
                    height={300}
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <FormField control={form.control} name="lat" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Latitude (or set via map)</FormLabel>
                      <FormControl><Input type="number" step="any" placeholder="-41.13" {...field} className="h-10 font-mono" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lng" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Longitude (or set via map)</FormLabel>
                      <FormControl><Input type="number" step="any" placeholder="174.85" {...field} className="h-10 font-mono" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Internal Notes</FormLabel>
                    <FormControl><Textarea placeholder="Access instructions, special requirements..." {...field} className="resize-none h-24" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="knownHazards" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-amber-600 uppercase tracking-wide font-semibold">Known Hazards</FormLabel>
                    <FormControl><Textarea placeholder="e.g. Low overhead power lines, uneven ground, aggressive dog on site…" {...field} className="resize-none h-24 border-amber-300 focus-visible:ring-amber-400" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
                <Button type="submit" disabled={submitting} style={{ background: BRAND }} className="text-white hover:opacity-90">
                  {submitting ? "Creating..." : "Save Asset"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}

function StormwaterForm({ onBack }: { onBack: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [boundary, setBoundary] = useState<GeoPolygon | null>(null);

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});

  const form = useForm<z.infer<typeof stormwaterSchema>>({
    resolver: zodResolver(stormwaterSchema),
    defaultValues: {
      globalId: "",
      name: "",
      departmentDetails: {},
    }
  });

  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data: z.infer<typeof stormwaterSchema>) => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...data };
      payload.department = "stormwater";
      payload.isSchedulable = false;
      payload.serviceTimeMins = null;
      payload.frequency = null;
      if (boundary) payload.boundary = boundary;

      const r = await fetch("/api/assets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error((err as Record<string, string>).error ?? "Failed to create asset");
      }
      const created = await r.json() as { name: string };
      toast({ title: "Asset Created", description: `${created.name} added to register.` });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      setLocation("/assets");
    } catch (err: unknown) {
      toast({
        title: "Failed to create",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center gap-4 sticky top-0 z-10 flex-shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Create Stormwater Asset</h1>
          <p className="text-xs text-gray-400">Add a new stormwater site to the registry</p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="border-b pb-2 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Identification</h3>
                  </div>

                  <FormField control={form.control} name="globalId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Global ID</FormLabel>
                      <FormControl><Input placeholder="e.g. SW-1024" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="departmentDetails.placemarkId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Placemark ID</FormLabel>
                      <FormControl><Input placeholder="e.g. PM-992" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Asset Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Main Culvert" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="departmentDetails.assetType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Asset Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {departmentRule("stormwater").specificationOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="departmentDetails.contractor" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Contractor</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {STORMWATER_OPTIONS.contractors.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="departmentDetails.priority" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {STORMWATER_OPTIONS.priorities.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="departmentDetails.hotspot" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Hotspot</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {STORMWATER_OPTIONS.hotspots.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="teamId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Assigned Team</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Select Team" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamsData?.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="space-y-6">
                  <div className="border-b pb-2 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Location</h3>
                  </div>

                  <FormField control={form.control} name="suburb" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Suburb</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Select Suburb" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STORMWATER_OPTIONS.suburbs.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="streetAddress" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Actual Address</FormLabel>
                      <FormControl><Input placeholder="e.g. 123 Main St" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Location Description</FormLabel>
                      <FormControl><Textarea placeholder="Specific details on how to locate the asset..." {...field} className="resize-none h-24" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Map Boundary</p>
                    <BoundaryEditor
                      initialBoundary={boundary}
                      initialLat={form.getValues("lat")}
                      initialLng={form.getValues("lng")}
                      onChange={(b, lat, lng) => {
                        setBoundary(b);
                        if (lat != null) form.setValue("lat", lat);
                        if (lng != null) form.setValue("lng", lng);
                      }}
                      height={300}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField control={form.control} name="lat" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Latitude</FormLabel>
                        <FormControl><Input type="number" step="any" placeholder="-41.13" {...field} className="h-10 font-mono" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="lng" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Longitude</FormLabel>
                        <FormControl><Input type="number" step="any" placeholder="174.85" {...field} className="h-10 font-mono" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
                <Button type="submit" disabled={submitting} style={{ background: BRAND }} className="text-white hover:opacity-90">
                  {submitting ? "Creating..." : "Save Asset"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}