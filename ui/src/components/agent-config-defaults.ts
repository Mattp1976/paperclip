import type { CreateConfigValues } from "@orqestra/adapter-utils";

export const defaultCreateValues: CreateConfigValues = {
  adapterType: "claude_local",
  cwd: "",
  instructionsFilePath: "",
  promptTemplate: "",
  model: "",
  thinkingEffort: "",
  chrome: false,
  dangerouslySkipPermissions: true,
  search: false,
  dangerouslyBypassSandbox: false,
  command: "",
  args: "",
  extraArgs: "",
  envVars: "",
  envBindings: {},
  url: "",
  bootstrapPrompt: "",
  payloadTemplateJson: "",
  workspaceStrategyType: "project_primary",
  workspaceBaseRef: "",
  workspaceBranchTemplate: "",
  worktreeParentDir: "",
  runtimeServicesJson: "",
  maxTurnsPerRun: 300,
  // Heartbeat off by default. intervalSec is the idle-poke cadence — only
  // takes effect when heartbeatEnabled is true. Keeping the cadence at 0
  // means "never auto-fire on idle" even if heartbeat gets toggled on later
  // without an explicit interval being set.
  heartbeatEnabled: false,
  intervalSec: 0,
};
