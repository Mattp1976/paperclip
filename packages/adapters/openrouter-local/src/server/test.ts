/**
 * testEnvironment for openrouter_local — verifies OPENROUTER_API_KEY is
 * set and that a trivial request to OpenRouter returns 200.
 */
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@orqestra/adapter-utils";

export async function testEnvironment(
  _ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    checks.push({
      code: "openrouter_api_key_missing",
      level: "error",
      message: "OPENROUTER_API_KEY is not set",
      hint: "Set OPENROUTER_API_KEY in the server environment to enable openrouter_local agents",
    });
    return {
      adapterType: "openrouter_local",
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  if (!apiKey.startsWith("sk-or-v1-")) {
    checks.push({
      code: "openrouter_api_key_format",
      level: "warn",
      message: "OPENROUTER_API_KEY does not match the expected sk-or-v1- prefix",
      hint: "Double-check the key was copied in full from https://openrouter.ai/keys",
    });
  }

  // Light reachability probe — does NOT spend tokens.
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      checks.push({
        code: "openrouter_reachable",
        level: "info",
        message: "OpenRouter API is reachable and the key is valid",
      });
    } else {
      checks.push({
        code: "openrouter_unreachable",
        level: "error",
        message: `OpenRouter rejected the key (HTTP ${res.status})`,
        detail: (await res.text().catch(() => "")).slice(0, 240),
      });
      return {
        adapterType: "openrouter_local",
        status: "fail",
        checks,
        testedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "openrouter_network_error",
      level: "error",
      message: `Could not reach OpenRouter: ${message}`,
    });
    return {
      adapterType: "openrouter_local",
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  return {
    adapterType: "openrouter_local",
    status: checks.some((c) => c.level === "warn") ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
