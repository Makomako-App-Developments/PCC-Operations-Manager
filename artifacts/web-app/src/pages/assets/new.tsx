import { useCreateAsset, useListTeams, getListTeamsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

const BRAND = "#00AECD";

const assetSchema = z.object({
  reference: z.string().min(1, "Reference is required"),
  name: z.string().min(1, "Name is required"),
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
});

export default function NewAsset() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});

  const form = useForm<z.infer<typeof assetSchema>>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      reference: "",
      name: "",
      gardenType: "amenity",
      standard: "medium",
      areaM2: 0,
      serviceTimeMins: 30,
      frequency: "monthly",
    }
  });

  const createMutation = useCreateAsset({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Asset Created", description: `${data.name} added to register.` });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        setLocation("/assets");
      },
      onError: (err: any) => {
        toast({ title: "Failed to create", description: err.message, variant: "destructive" });
      }
    }
  });

  const onSubmit = (data: z.infer<typeof assetSchema>) => {
    createMutation.mutate({ data });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center gap-4 sticky top-0 z-10 flex-shrink-0">
        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Create Garden Asset</h1>
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

                  <FormField control={form.control} name="reference" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Asset Reference</FormLabel>
                      <FormControl><Input placeholder="e.g. GRD-1234" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Site Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Aotea Lagoon Entry" {...field} className="h-10" /></FormControl>
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

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-gray-500 uppercase tracking-wide">Internal Notes</FormLabel>
                    <FormControl><Textarea placeholder="Access instructions, special requirements..." {...field} className="resize-none h-24" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="outline" onClick={() => window.history.back()}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} style={{ background: BRAND }} className="text-white hover:opacity-90">
                  {createMutation.isPending ? "Creating..." : "Save Asset"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
