import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  OrchestrationV2ProviderThread,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  getProviderSkillsForSlashMenu,
  resolveProviderExtensionUi,
  currentProviderPresentation,
  resolveThreadProviderPresentation,
  hasCompleteProviderWorkspaceSnapshot,
  resolveProviderSkillsForCwd,
  resolveProviderSlashCommandsForCwd,
} from "./providerSkills.ts";

const provider = {
  instanceId: ProviderInstanceId.make("codex"),
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: [],
  slashCommands: [{ name: "global" }],
  skills: [{ name: "global", path: "/global/SKILL.md", enabled: true }],
  workspaceSnapshots: [
    {
      cwd: "/workspace/project-a",
      checkedAt: "2026-01-01T00:01:00.000Z",
      slashCommands: [{ name: "project" }],
      skills: [{ name: "project", path: "/workspace/project-a/SKILL.md", enabled: true }],
    },
  ],
} satisfies ServerProvider;

describe("getProviderSkillsForSlashMenu", () => {
  it("keeps the skill alias when the provider also exposes it as a slash command", () => {
    const askMatt = {
      name: "ask-matt",
      path: "/Users/matt/.agents/skills/ask-matt/SKILL.md",
      enabled: true,
    };
    expect(getProviderSkillsForSlashMenu([askMatt], true).map((skill) => skill.name)).toEqual([
      "ask-matt",
    ]);
  });

  it("shows one row when enabled skills share a name", () => {
    const skills = [
      {
        name: "babysit-pr",
        path: "/Users/matt/.codex/skills/babysit-pr/SKILL.md",
        enabled: true,
      },
      {
        name: "browser",
        path: "/Users/matt/.agents/skills/browser/SKILL.md",
        enabled: true,
      },
      {
        name: "babysit-pr",
        path: "/Users/matt/.agents/skills/babysit-pr/SKILL.md",
        enabled: true,
      },
    ];

    expect(getProviderSkillsForSlashMenu(skills, true).map((skill) => skill.name)).toEqual([
      "babysit-pr",
      "browser",
    ]);
  });

  it("keeps an enabled skill when a disabled duplicate appears first", () => {
    const enabledSkill = {
      name: "babysit-pr",
      path: "/Users/matt/.agents/skills/babysit-pr/SKILL.md",
      enabled: true,
    };
    const skills = [
      {
        name: "babysit-pr",
        path: "/Users/matt/.codex/skills/babysit-pr/SKILL.md",
        enabled: false,
      },
      enabledSkill,
    ];

    expect(getProviderSkillsForSlashMenu(skills, true)).toEqual([enabledSkill]);
  });
});

describe("workspace provider snapshots", () => {
  it("uses the cwd snapshot after a provider session has populated it", () => {
    expect(resolveProviderSkillsForCwd(provider, "/workspace/project-a")).toEqual([
      { name: "project", path: "/workspace/project-a/SKILL.md", enabled: true },
    ]);
    expect(resolveProviderSlashCommandsForCwd(provider, "/workspace/project-a")).toEqual([
      { name: "project" },
    ]);
  });

  it("keeps the machine snapshot before this cwd has a provider snapshot", () => {
    expect(resolveProviderSkillsForCwd(provider, "/workspace/project-b")).toEqual(provider.skills);
    expect(resolveProviderSlashCommandsForCwd(provider, null)).toEqual(provider.slashCommands);
  });

  it("uses partial workspace skills and commands while keeping discovery retryable", () => {
    const partial = {
      ...provider,
      workspaceSnapshots: provider.workspaceSnapshots.map((snapshot) => ({
        ...snapshot,
        slashCommands: [{ name: "compact" }],
        slashCommandsPending: true,
      })),
    } satisfies ServerProvider;
    expect(resolveProviderSkillsForCwd(partial, "/workspace/project-a")).toEqual(
      provider.workspaceSnapshots[0]?.skills,
    );
    expect(resolveProviderSlashCommandsForCwd(partial, "/workspace/project-a")).toEqual([
      { name: "compact" },
    ]);
    expect(hasCompleteProviderWorkspaceSnapshot(partial, "/workspace/project-a")).toBe(false);
    expect(hasCompleteProviderWorkspaceSnapshot(provider, "/workspace/project-a")).toBe(true);
    expect(hasCompleteProviderWorkspaceSnapshot(provider, "/workspace/project-b")).toBe(false);
    expect(hasCompleteProviderWorkspaceSnapshot(undefined, "/workspace/project-a")).toBe(false);
    expect(hasCompleteProviderWorkspaceSnapshot(provider, null)).toBe(false);
  });
});

const nativeThread = Schema.decodeUnknownSync(OrchestrationV2ProviderThread)({
  id: "provider-thread-1",
  driver: "codex",
  providerInstanceId: "codex",
  providerSessionId: "session-a",
  appThreadId: "thread-a",
  ownerNodeId: null,
  nativeThreadRef: { driver: "codex", nativeId: "/sessions/a.jsonl", strength: "strong" },
  nativeConversationHeadRef: null,
  status: "idle",
  firstRunOrdinal: null,
  lastRunOrdinal: null,
  handoffIds: [],
  forkedFrom: null,
  createdAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
  updatedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
  runtimeCatalog: {
    providerSessionId: "session-a",
    nativeThreadId: "/sessions/a.jsonl",
    skills: [{ name: "native", path: "/native/SKILL.md", enabled: true }],
    slashCommands: [{ name: "extension-command" }],
    pending: false,
  },
  extensionUi: {
    providerSessionId: "session-a",
    nativeThreadId: "/sessions/a.jsonl",
    title: "Native",
    statuses: [],
    widgets: [],
    notices: [],
    editor: null,
  },
});

describe("session-scoped provider presentation", () => {
  it("selects only the active thread owned by the current app thread and a live session", () => {
    const projection = {
      thread: {
        id: nativeThread.appThreadId!,
        providerInstanceId: nativeThread.providerInstanceId,
        activeProviderThreadId: nativeThread.id,
      },
      providerThreads: [nativeThread],
      providerSessions: [{ id: nativeThread.providerSessionId!, status: "ready" as const }],
    };
    expect(resolveThreadProviderPresentation(projection)).toBe(nativeThread);
    expect(
      resolveThreadProviderPresentation({
        ...projection,
        thread: { ...projection.thread, activeProviderThreadId: null },
      }),
    ).toBeNull();
    expect(
      resolveThreadProviderPresentation({
        ...projection,
        providerThreads: [{ ...nativeThread, appThreadId: null }],
      }),
    ).toBeNull();
    expect(
      resolveThreadProviderPresentation({
        ...projection,
        providerSessions: [{ ...projection.providerSessions[0]!, status: "stopped" }],
      }),
    ).toBeNull();
    expect(resolveThreadProviderPresentation({ ...projection, providerSessions: [] })).toBeNull();
  });
  it("uses the running process catalog instead of a separate workspace probe", () => {
    expect(
      resolveProviderSkillsForCwd(provider, "/workspace/project-a", nativeThread).map(
        (skill) => skill.name,
      ),
    ).toEqual(["native"]);
    expect(
      resolveProviderSlashCommandsForCwd(provider, "/workspace/project-a", nativeThread),
    ).toEqual([{ name: "extension-command" }]);
    expect(resolveProviderExtensionUi(nativeThread, provider.instanceId)?.title).toBe("Native");
  });
  it("treats an empty native catalog as authoritative, including pending discovery", () => {
    const empty = {
      ...nativeThread,
      runtimeCatalog: {
        ...nativeThread.runtimeCatalog!,
        skills: [],
        slashCommands: [],
        pending: true,
      },
    };
    expect(resolveProviderSkillsForCwd(provider, "/workspace/project-a", empty)).toEqual([]);
    expect(resolveProviderSlashCommandsForCwd(provider, null, empty)).toEqual([]);
  });
  it("rejects inherited metadata after native or T3 session changes", () => {
    for (const changed of [
      { ...nativeThread, providerSessionId: null },
      {
        ...nativeThread,
        nativeThreadRef: { ...nativeThread.nativeThreadRef!, nativeId: "/sessions/b.jsonl" },
      },
    ]) {
      expect(currentProviderPresentation(changed, changed.runtimeCatalog)).toBe(false);
      expect(resolveProviderExtensionUi(changed, provider.instanceId)).toBeNull();
      expect(resolveProviderSkillsForCwd(provider, null, changed)).toEqual(provider.skills);
    }
    const other = { ...provider, instanceId: ProviderInstanceId.make("other") };
    expect(resolveProviderSkillsForCwd(other, null, nativeThread)).toEqual(provider.skills);
    expect(resolveProviderExtensionUi(nativeThread, other.instanceId)).toBeNull();
  });
});
