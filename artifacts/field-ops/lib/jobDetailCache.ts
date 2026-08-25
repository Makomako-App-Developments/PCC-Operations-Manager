import AsyncStorage from "@react-native-async-storage/async-storage";

const CORE_JOB_CACHE_PREFIX = "@field_ops_core_job_v1:";

export async function loadCachedCoreJob<T>(jobId: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(`${CORE_JOB_CACHE_PREFIX}${jobId}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
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