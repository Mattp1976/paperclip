import type { StandupSnapshot } from "@mattparrytfc/shared";
import { api } from "./client";

export const standupApi = {
  daily: (companyId: string, windowHours?: number) =>
    api.get<StandupSnapshot>(
      `/companies/${companyId}/standup${windowHours ? `?windowHours=${windowHours}` : ""}`,
    ),
};
