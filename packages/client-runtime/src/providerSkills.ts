import {
  isProviderWorkspaceSnapshotCurrent,
  type ServerProvider,
  type ServerProviderSkill,
  type ServerProviderSlashCommand,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";

export type ProviderSkillSourceKind = "app" | "repo" | "project" | "personal" | "system" | "other";

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replaceAll("\\", "/");
}

export function dedupeProviderSkillsByName(
  skills: ReadonlyArray<ServerProviderSkill>,
): ServerProviderSkill[] {
  const seenNames = new Set<string>();
  return skills.filter((skill) => {
    const normalizedName = skill.name.trim().toLowerCase();
    if (seenNames.has(normalizedName)) {
      return false;
    }
    seenNames.add(normalizedName);
    return true;
  });
}

/**
 * A skill switched off in the provider's settings will not run, and one the
 * provider reserves for the agent (Claude Code's `user-invocable: false`)
 * rejects a user invocation. Everything else, including skills the agent may
 * not start on its own, is fair game: the server dispatches the pick in the
 * provider's native form.
 */
export function isProviderSkillUserInvocable(
  skill: Pick<ServerProviderSkill, "enabled" | "userInvocable">,
): boolean {
  return skill.enabled && skill.userInvocable !== false;
}

export function getProviderSkillsForSlashMenu(
  skills: ReadonlyArray<ServerProviderSkill>,
  showSkillsInSlashMenu: boolean,
): ServerProviderSkill[] {
  return showSkillsInSlashMenu
    ? dedupeProviderSkillsByName(skills.filter(isProviderSkillUserInvocable))
    : [];
}

export function getProviderSlashCommandsForSlashMenu(
  slashCommands: ReadonlyArray<ServerProviderSlashCommand>,
  visibleSkills: ReadonlyArray<ServerProviderSkill>,
): ServerProviderSlashCommand[] {
  const skillNames = new Set(visibleSkills.map((skill) => skill.name.trim().toLowerCase()));
  return slashCommands.filter((command) => !skillNames.has(command.name.trim().toLowerCase()));
}

export function resolveProviderSkillSourceKind(
  skill: Pick<ServerProviderSkill, "path" | "scope">,
): ProviderSkillSourceKind {
  const normalizedPath = normalizePathSeparators(skill.path);
  if (normalizedPath.includes("/.codex/plugins/") || normalizedPath.includes("/.agents/plugins/")) {
    return "app";
  }

  const normalizedScope = skill.scope?.trim().toLowerCase();
  switch (normalizedScope) {
    case "repo":
    case "repository":
      return "repo";
    case "project":
    case "workspace":
    case "local":
      return "project";
    case "user":
    case "personal":
      return "personal";
    case "system":
      return "system";
    case undefined:
    case "":
      return "other";
    default:
      return "other";
  }
}

function resolveProviderWorkspaceSnapshot(
  provider: ServerProvider,
  cwd: string | null | undefined,
) {
  if (!cwd) return undefined;
  return provider.workspaceSnapshots?.find((snapshot) => snapshot.cwd === cwd);
}

export function hasCompleteProviderWorkspaceSnapshot(
  provider: ServerProvider | null | undefined,
  cwd: string | null | undefined,
): boolean {
  const snapshot = provider && resolveProviderWorkspaceSnapshot(provider, cwd);
  return Boolean(snapshot && !snapshot.slashCommandsPending);
}

export function hasCurrentProviderWorkspaceSnapshot(
  provider: ServerProvider | null | undefined,
  cwd: string | null | undefined,
  nowMs: number,
): boolean {
  const snapshot = provider && resolveProviderWorkspaceSnapshot(provider, cwd);
  return Boolean(
    snapshot &&
    !snapshot.slashCommandsPending &&
    isProviderWorkspaceSnapshotCurrent(snapshot, nowMs),
  );
}

export function resolveProviderSkillsForCwd(
  provider: ServerProvider,
  cwd: string | null | undefined,
  thread?: OrchestrationV2ProviderThread | null,
): ServerProvider["skills"] {
  if (
    thread?.providerInstanceId === provider.instanceId &&
    currentProviderPresentation(thread, thread.runtimeCatalog)
  )
    return thread.runtimeCatalog!.skills;
  return resolveProviderWorkspaceSnapshot(provider, cwd)?.skills ?? provider.skills;
}

export function resolveProviderSlashCommandsForCwd(
  provider: ServerProvider,
  cwd: string | null | undefined,
  thread?: OrchestrationV2ProviderThread | null,
): ServerProvider["slashCommands"] {
  if (
    thread?.providerInstanceId === provider.instanceId &&
    currentProviderPresentation(thread, thread.runtimeCatalog)
  )
    return thread.runtimeCatalog!.slashCommands;
  return resolveProviderWorkspaceSnapshot(provider, cwd)?.slashCommands ?? provider.slashCommands;
}

export function currentProviderPresentation(
  thread: OrchestrationV2ProviderThread,
  presentation:
    | { readonly providerSessionId: string; readonly nativeThreadId: string }
    | null
    | undefined,
): boolean {
  return (
    presentation != null &&
    presentation.providerSessionId === thread.providerSessionId &&
    presentation.nativeThreadId === thread.nativeThreadRef?.nativeId
  );
}

export function resolveProviderExtensionUi(
  thread: OrchestrationV2ProviderThread | null | undefined,
  instanceId: ServerProvider["instanceId"] | null | undefined,
) {
  const ui = thread?.extensionUi;
  return thread?.providerInstanceId === instanceId && ui && currentProviderPresentation(thread, ui)
    ? ui
    : null;
}

export function resolveThreadProviderPresentation(
  projection:
    | {
        readonly thread: Pick<
          OrchestrationV2ThreadProjection["thread"],
          "id" | "activeProviderThreadId" | "providerInstanceId"
        >;
        readonly providerThreads: OrchestrationV2ThreadProjection["providerThreads"];
        readonly providerSessions: ReadonlyArray<
          Pick<OrchestrationV2ThreadProjection["providerSessions"][number], "id" | "status">
        >;
      }
    | null
    | undefined,
): OrchestrationV2ProviderThread | null {
  if (!projection) return null;
  const thread = projection.providerThreads.find(
    (candidate) =>
      candidate.id === projection.thread.activeProviderThreadId &&
      candidate.appThreadId === projection.thread.id &&
      candidate.providerInstanceId === projection.thread.providerInstanceId,
  );
  if (!thread) return null;
  const session = projection.providerSessions.find(
    (session) => session.id === thread.providerSessionId,
  );
  return session && session.status !== "stopped" && session.status !== "error" ? thread : null;
}
