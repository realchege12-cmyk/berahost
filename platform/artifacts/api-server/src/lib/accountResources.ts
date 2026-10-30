export { accountStorageUsageBytes, refreshAccountQuota } from "./resourceManager";
export type AccountQuota = { usedBytes: number; limitBytes: number; exceeded: boolean };
