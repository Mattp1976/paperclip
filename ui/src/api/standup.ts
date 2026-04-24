import type { StandupDigest, StandupSnapshot } from "@mattparrytfc/shared";
import { api } from "./client";

export interface StandupDigestResponse {
  digest: StandupDigest;
  markdown: string;
}

export const standupApi = {
  daily: (companyId: string, windowHours?: number) =>
    api.get<StandupSnapshot>(
      `/companies/${companyId}/standup${windowHours ? `?windowHours=${windowHours}` : ""}`,
    ),
  digest: (companyId: string, windowHours?: number) =>
    api.get<StandupDigestResponse>(
      `/companies/${companyId}/standup/digest${windowHours ? `?windowHours=${windowHours}` : ""}`,
    ),
};
