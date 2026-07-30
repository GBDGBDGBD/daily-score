import type { StorageStatus } from "@/app/lib/types";

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const [persisted, estimate] = await Promise.all([
    navigator.storage?.persisted?.(),
    navigator.storage?.estimate?.(),
  ]);
  return {
    persisted: persisted ?? false,
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0,
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
