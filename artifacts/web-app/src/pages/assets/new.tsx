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
import { ArrowLeft } from "lucide-react";
import BoundaryEditor, { type GeoPolygon } from "@/components/BoundaryEditor";

const BRAND = "#00AECD";
const DEPARTMENTS = [
  ["garden", "Garden"],
  ["mowing", "Mowing"],
  ["stormwater", "Stormwater"],
  ["sportsfields", "Sportsfields"],
  ["city_cleaning", "City Cleaning"],
] as const;

const assetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  department: z.enum(["garden", "mowing", "stormwater", "sportsfields", "city_cleaning"]),
  siteType: z.enum(["park","street"]).optional(),
  gardenType: z.enum(["annuals","roses_perennials","ornamental","amenity","rain_garden","reveg","bush","tree_planter_pits","hedge"]),
  standard: z.enum(["high","medium","low"]),
  areaM2: z.coerce.number().min(1, "Area must be at least 1"),
  serviceTimeMins: z.coerce.number().min(1, "Service time must be at least 1"),
  frequency: z.enum(["weekly","fortnightly","monthly","bimonthly","quarterly"]),
  teamId: z.string().optional(),
  ward: z.enum(["eastern","northern","western"]).optional(),
  suburb: z.string().optional(),
  streetAddress: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  notes: z.string().optional(),
  knownHazards: z.string().optional(),
});

export default function NewAsset() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [boundary, setBoundary] = useState<GeoPolygon | null>(null);

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});

  const form = useForm<z.infer<typeof assetSchema>>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      department: "garden",
      gardenType: "amenity",
      standard: "medium",
      areaM2: 0,
      serviceTimeMins: 30,
      frequency: "monthly",
    }
  });

  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data: z.infer<typeof assetSchema>) => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...data };
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
        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-500">
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEPARTMENTS.map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="siteType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Garden Type</FormLabel>
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

                    <FormField control={form.control} name="gardenType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Specification</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="amenity">Amenity</SelectItem>
                            <SelectItem value="annuals">Annuals</SelectItem>
                            <SelectItem value="bush">Bush</SelectItem>
                            <SelectItem value="hedge">Hedge</SelectItem>
                            <SelectItem value="ornamental">Ornamental</SelectItem>
                            <SelectItem value="rain_garden">Rain Garden</SelectItem>
                            <SelectItem value="reveg">Reveg</SelectItem>
                            <SelectItem value="roses_perennials">Roses & Perennials</SelectItem>
                            <SelectItem value="tree_planter_pits">Tree Planter Pits</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="standard" render={({ field }) => (
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
                    )} />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border-b pb-2 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Service Details</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="areaM2" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Area (m²)</FormLabel>
                        <FormControl><Input type="number" {...field} className="h-10" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="serviceTimeMins" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Service Time (mins)</FormLabel>
                        <FormControl><Input type="number" {...field} className="h-10" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="frequency" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Frequency</FormLabel>
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
                <Button type="button" variant="outline" onClick={() => window.history.back()}>Cancel</Button>
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
