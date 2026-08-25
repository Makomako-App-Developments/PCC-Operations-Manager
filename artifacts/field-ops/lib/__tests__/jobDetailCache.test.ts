import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  },
}));

import {
  loadCachedAsset,
  loadCachedAssetList,
  loadCachedCoreJob,
  saveCachedAsset,
  saveCachedAssetList,
} from "../jobDetailCache";

beforeEach(() => store.clear());

describe("asset detail cache", () => {
  it("round-trips the last successful asset payload per asset", async () => {
    const asset = { id: "asset-1", name: "Rose Garden", lat: "-41.1" };
    await saveCachedAsset(asset.id, asset);

    await expect(loadCachedAsset<typeof asset>(asset.id)).resolves.toEqual(asset);
    await expect(loadCachedAsset("asset-2")).resolves.toBeUndefined();
  });

  it("ignores malformed and non-object cached responses", async () => {
    store.set("@field_ops_asset_v1:bad-json", "{not-json");
    store.set("@field_ops_asset_v1:string", JSON.stringify("not an asset"));
    store.set("@field_ops_asset_v1:null", "null");

    await expect(loadCachedAsset("bad-json")).resolves.toBeUndefined();
    await expect(loadCachedAsset("string")).resolves.toBeUndefined();
    await expect(loadCachedAsset("null")).resolves.toBeUndefined();
  });

  it("preserves partial asset metadata for offline display", async () => {
    const partialAsset = { id: "asset-3", name: "North Bed", description: "Keep clear" };
    await saveCachedAsset(partialAsset.id, partialAsset);

    await expect(loadCachedAsset<typeof partialAsset>(partialAsset.id)).resolves.toEqual(partialAsset);
  });

  it("keeps the existing core job cache readable", async () => {
    store.set("@field_ops_core_job_v1:job-1", JSON.stringify({ id: "job-1" }));
    await expect(loadCachedCoreJob("job-1")).resolves.toEqual({ id: "job-1" });
  });
});

describe("asset list cache", () => {
  it("round-trips the latest successful list", async () => {
    const assets = [{ id: "asset-1", name: "Rose Garden" }];
    await saveCachedAssetList(assets);

    await expect(loadCachedAssetList<typeof assets>()).resolves.toEqual(assets);
  });

  it("ignores malformed or non-list cached responses", async () => {
    store.set("@field_ops_asset_list_v1", JSON.stringify({ data: [] }));
    await expect(loadCachedAssetList()).resolves.toBeUndefined();

    store.set("@field_ops_asset_list_v1", "{not-json");
    await expect(loadCachedAssetList()).resolves.toBeUndefined();
  });
});