import { API_PREFIX, HealthLiveResponse } from "@chatisen/shared";
import { Value } from "@sinclair/typebox/value";

export type ApiHealth = "checking" | "up" | "down";

/** Interroge la sonde de vie de l'API ; toute réponse hors contrat compte comme « down ». */
export async function checkApiHealth(fetchFn: typeof fetch = fetch): Promise<Exclude<ApiHealth, "checking">> {
  try {
    const res = await fetchFn(`${API_PREFIX}/health/live`, { headers: { accept: "application/json" } });
    if (!res.ok) return "down";
    return Value.Check(HealthLiveResponse, await res.json()) ? "up" : "down";
  } catch {
    return "down";
  }
}
