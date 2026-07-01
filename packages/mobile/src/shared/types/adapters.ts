import type { ApiPort } from "@/domain/ports/api.port";
import type { AuthPort } from "@/domain/ports/auth.port";
import type { NetInfoPort } from "@/domain/ports/netInfo.port";
import type { StoragePort } from "@/domain/ports/storage.port";

export interface Adapters {
  api: ApiPort;
  auth: AuthPort;
  storage: StoragePort;
  netInfo: NetInfoPort;
}
