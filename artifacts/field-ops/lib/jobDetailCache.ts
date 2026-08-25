import AsyncStorage from "@react-native-async-storage/async-storage";

const CORE_JOB_CACHE_PREFIX = "@field_ops_core_job_v1:";
const ASSET_CACHE_PREFIX = "@field_ops_asset_v1:";

function parseCached<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function loadCachedCoreJob<T>(jobId: string): Promise<T | undefined> {
  try {
    return parseCached<T>(await AsyncStorage.getItem(`${CORE_JOB_CACHE_PREFIX}${jobId}`));
  } catch {
    return undefined;
  }
}

export async function saveCachedCoreJob<T>(jobId: string, job: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CORE_JOB_CACHE_PREFIX}${jobId}`, JSON.stringify(job));
  } catch {
    // A cache write must never interfere with the usable server response.
  }
}

/** Read the last successful asset response without allowing bad storage to break the screen. */
export async function loadCachedAsset<T>(assetId: string): Promise<T | undefined> {
  try {
    return parseCached<T>(await AsyncStorage.getItem(`${ASSET_CACHE_PREFIX}${assetId}`));
  } catch {
    return undefined;
  }
}

/** Cache only successful responses; cache failures must never affect the live request. */
export async function saveCachedAsset<T>(assetId: string, asset: T): Promise<void> {
  try {
    if (asset && typeof asset === "object") {
      await AsyncStorage.setItem(`${ASSET_CACHE_PREFIX}${assetId}`, JSON.stringify(asset));
    }
  } catch {
    // A cache write must never interfere with the usable server response.
  }
}