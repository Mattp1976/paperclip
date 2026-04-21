import type { AgentQuestionForUser } from "@mattparrytfc/shared";
import { api } from "./client";

export const agentQuestionsApi = {
  listOpen: (companyId: string) =>
    api.get<AgentQuestionForUser[]>(`/companies/${companyId}/questions/open`),
  answer: (id: string, answer: string) =>
    api.post<AgentQuestionForUser>(`/questions/${id}/answer`, { answer }),
  dismiss: (id: string) => api.post<AgentQuestionForUser>(`/questions/${id}/dismiss`, {}),
};
