// @effect-diagnostics nodeBuiltinImport:off -- Resolves the pinned Pi CLI and fixture extension at the subprocess boundary.
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";

import { emptyPiExtensionUi, updatePiExtensionUi } from "./presentation.ts";
import { parsePiDiscoveredCommands } from "./commands.ts";
import { buildPiRpcLaunch, materializePiT3McpExtension } from "./mcpInjection.ts";
import { makePiRpcConnection, piRecordField, piRecordString } from "./rpc.ts";
import { discoverPiCommandsForCwd } from "./status.ts";

const piBinary = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))),
  "bundle/cli.js",
);
const fixtureExtension = NodeURL.fileURLToPath(
  new URL("./fixtures/pi-fixture-extension.ts", import.meta.url),
);

const makeFixture = Effect.fn("PiSkillsTest.makeFixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-real-pi-skills-" });
  const home = NodePath.join(root, "home");
  const agentDir = NodePath.join(home, ".pi/agent");
  const project = NodePath.join(root, "project");
  const nested = NodePath.join(project, "nested");
  const otherProject = NodePath.join(root, "other");
  for (const directory of [agentDir, nested, otherProject, NodePath.join(project, ".git")]) {
    yield* fs.makeDirectory(directory, { recursive: true });
  }
  const writeSkill = Effect.fn("PiSkillsTest.writeSkill")(function* (
    directory: string,
    name: string,
    body: string,
    manual = false,
  ) {
    const skillDir = NodePath.join(directory, name);
    yield* fs.makeDirectory(skillDir, { recursive: true });
    const path = NodePath.join(skillDir, "SKILL.md");
    yield* fs.writeFileString(
      path,
      `---\nname: ${name}\ndescription: Harmless fixture ${name}\n${manual ? "disable-model-invocation: true\n" : ""}---\n\n${body}\n`,
    );
    return path;
  });
  const userPi = yield* writeSkill(NodePath.join(agentDir, "skills"), "user-pi", "USER_PI");
  const userAgents = yield* writeSkill(
    NodePath.join(home, ".agents/skills"),
    "user-agents",
    "USER_AGENTS",
  );
  const projectPi = yield* writeSkill(
    NodePath.join(nested, ".pi/skills"),
    "project-pi",
    "PROJECT_PI",
  );
  const projectAgents = yield* writeSkill(
    NodePath.join(project, ".agents/skills"),
    "project-agents",
    "PROJECT_AGENTS",
  );
  yield* writeSkill(NodePath.join(root, ".agents/skills"), "outside-repo", "MUST_NOT_LOAD");
  yield* writeSkill(NodePath.join(nested, ".pi/skills"), "manual-only", "MANUAL_ONLY", true);
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: "1",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  const args = [
    "--offline",
    "--no-mcp",
    "--no-context-files",
    "--extension",
    fixtureExtension,
    "--provider",
    "t3-fixture",
    "--model",
    "echo",
  ];
  const extensionPath = yield* materializePiT3McpExtension(NodePath.join(root, "cache"));
  const connect = (
    cwd: string,
    approve: boolean,
    toolOptions?: { readonly name: "read" | "write"; readonly replacement: boolean },
  ) => {
    const launch = buildPiRpcLaunch({
      launchArgs: [...args, approve ? "--approve" : "--no-approve"],
      environment: {
        ...env,
        ...(toolOptions === undefined
          ? {}
          : {
              T3_PI_FIXTURE_TOOL: toolOptions.name,
              ...(toolOptions.replacement ? { T3_PI_FIXTURE_REPLACEMENT: toolOptions.name } : {}),
            }),
      },
      mcpSession: undefined,
      extensionPath,
      runtimeMode: toolOptions?.name === "write" ? "auto-accept-edits" : "approval-required",
    });
    return makePiRpcConnection({ command: piBinary, args: launch.args, cwd, env: launch.env });
  };
  return {
    fs,
    root,
    nested,
    otherProject,
    env,
    args,
    connect,
    writeSkill,
    userPi,
    userAgents,
    projectPi,
    projectAgents,
  };
});

describe("real Pi skills without model APIs", () => {
  it.live.each([
    { name: "read", replacement: false },
    { name: "read", replacement: true },
    { name: "write", replacement: false },
    { name: "write", replacement: true },
  ] as const)("enforces the real Pi tool provenance for $name, replacement=$replacement", (tool) =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture();
      const file = NodePath.join(fixture.nested, "fixture.txt");
      yield* fixture.fs.writeFileString(file, "NATIVE_READ");
      const connection = yield* fixture.connect(fixture.nested, true, tool);
      yield* connection.request({ type: "prompt", message: "Run the fixture tool" });
      let confirmations = 0;
      let toolResult: unknown;
      let isError = false;
      while (true) {
        const event = yield* Queue.take(connection.events);
        if (event["type"] === "agent_settled") break;
        if (event["type"] === "extension_error") return yield* Effect.die(event);
        if (event["type"] === "extension_ui_request" && event["method"] === "confirm") {
          confirmations += 1;
          assert.equal(event["title"], `Allow ${tool.name}?`);
          yield* connection.send({
            type: "extension_ui_response",
            id: event["id"],
            confirmed: false,
          });
        }
        if (event["type"] === "tool_execution_end") {
          toolResult = event["result"];
          isError = event["isError"] === true;
        }
      }
      assert.isDefined(toolResult);
      assert.equal(confirmations, tool.replacement ? 1 : 0);
      assert.equal(isError, tool.replacement);
      assert.notInclude(JSON.stringify(toolResult), "FIXTURE_REPLACEMENT_EXECUTED");
      assert.equal(
        yield* fixture.fs.readFileString(file),
        tool.name === "write" && !tool.replacement ? "FIXTURE_WRITTEN" : "NATIVE_READ",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.live("maps real Pi RPC title, status, widget and editor updates without a model call", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture();
      const connection = yield* fixture.connect(fixture.nested, true);
      yield* connection.request({ type: "prompt", message: "/fixture-presentation" });
      let state = emptyPiExtensionUi();
      while (!state.notices.some((notice) => notice.message === "Fixture notice")) {
        const event = yield* Queue.take(connection.events);
        if (event["type"] === "extension_error") return yield* Effect.die(event);
        if (event["type"] === "extension_ui_request") state = updatePiExtensionUi(state, event);
      }
      assert.equal(state.title, "Fixture title");
      assert.deepEqual(state.statuses, [{ key: "fixture", text: "Fixture status" }]);
      assert.deepEqual(state.widgets, [
        { key: "fixture", lines: ["First", "Second"], placement: "belowEditor" },
      ]);
      assert.equal(state.editor?.text, "  Exact draft\n");
      assert.equal(state.notices.at(-1)?.level, "warning");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.live.each([false, true])(
    "discovers user and workspace skills with project trust=%s",
    (approved) =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture();
        const settings = {
          enabled: true,
          binaryPath: piBinary,
          launchArgs: [...fixture.args, approved ? "--approve" : "--no-approve"]
            .map((arg) => JSON.stringify(arg))
            .join(" "),
          customModels: [],
        };
        const catalog = yield* discoverPiCommandsForCwd(settings, fixture.env, fixture.nested);
        assert.deepEqual(
          catalog.skills.map((skill) => skill.name).sort(),
          approved
            ? ["manual-only", "project-agents", "project-pi", "user-agents", "user-pi"]
            : ["user-agents", "user-pi"],
        );
        assert.deepEqual(
          catalog.skills
            .filter((skill) => skill.scope === "user")
            .map((skill) => skill.path)
            .sort(),
          [fixture.userAgents, fixture.userPi].sort(),
        );
        if (approved)
          assert.deepEqual(
            catalog.skills
              .filter((skill) => skill.scope === "project")
              .map((skill) => skill.path)
              .sort(),
            [
              fixture.projectAgents,
              fixture.projectPi,
              NodePath.join(fixture.nested, ".pi/skills/manual-only/SKILL.md"),
            ].sort(),
          );
        assert.isFalse(
          yield* fixture.fs.exists(NodePath.join(fixture.root, "home/.pi/agent/trust.json")),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.live(
    "expands skills, reloads resources and resumes the persisted session in its original workspace",
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture();
        const sessionFile = yield* Effect.scoped(
          Effect.gen(function* () {
            const connection = yield* fixture.connect(fixture.nested, true);
            const state = yield* connection.request({ type: "get_state" });
            const sessionFile = piRecordString(state, "sessionFile");
            assert.isDefined(sessionFile);
            const prompt = "/skill:project-agents use $user-pi and $user-agents";
            yield* connection.request({ type: "prompt", message: prompt });
            while ((yield* Queue.take(connection.events))["type"] !== "agent_settled") {
              /* Drain until Pi has no automatic work left. */
            }
            const data = yield* connection.request({ type: "get_messages" });
            const messages = piRecordField(data, "messages");
            assert.isArray(messages);
            if (!Array.isArray(messages)) return yield* Effect.die("Missing Pi messages");
            const assistant = messages.findLast(
              (message) => piRecordString(message, "role") === "assistant",
            );
            const systemReply = JSON.stringify(piRecordField(assistant, "content"));
            assert.include(systemReply, "user-pi");
            assert.notInclude(systemReply, "manual-only");
            const serialized = JSON.stringify(messages);
            for (const marker of ["PROJECT_AGENTS", "USER_PI", "USER_AGENTS"])
              assert.include(serialized, marker);
            assert.notInclude(serialized, "name: project-agents");
            assert.include(serialized, "References are relative to");
            assert.notInclude(serialized, "MANUAL_ONLY");
            yield* connection.request({
              type: "prompt",
              message: "/skill:manual-only explicit request",
            });
            while ((yield* Queue.take(connection.events))["type"] !== "agent_settled") {
              /* Drain until Pi has no automatic work left. */
            }
            assert.include(
              JSON.stringify(yield* connection.request({ type: "get_messages" })),
              "MANUAL_ONLY",
            );
            yield* fixture.writeSkill(
              NodePath.join(fixture.nested, ".pi/skills"),
              "added-later",
              "RELOADED_SKILL",
            );
            const beforeReload = parsePiDiscoveredCommands(
              yield* connection.request({ type: "get_commands" }),
            );
            assert.notInclude(
              beforeReload.skills.map((skill) => skill.name),
              "added-later",
            );
            yield* connection.request({ type: "prompt", message: "/fixture-reload" });
            const afterReload = parsePiDiscoveredCommands(
              yield* connection.request({ type: "get_commands" }),
            );
            assert.include(
              afterReload.skills.map((skill) => skill.name),
              "added-later",
            );
            yield* connection.request({ type: "prompt", message: "/skill:added-later" });
            while ((yield* Queue.take(connection.events))["type"] !== "agent_settled") {
              /* Drain until Pi has no automatic work left. */
            }
            assert.include(
              JSON.stringify(yield* connection.request({ type: "get_messages" })),
              "RELOADED_SKILL",
            );
            assert.equal(
              piRecordString(yield* connection.request({ type: "get_state" }), "sessionFile"),
              sessionFile,
            );
            return sessionFile!;
          }),
        );
        const connection = yield* fixture.connect(fixture.otherProject, true);
        const beforeSwitch = parsePiDiscoveredCommands(
          yield* connection.request({ type: "get_commands" }),
        );
        assert.notInclude(
          beforeSwitch.skills.map((skill) => skill.name),
          "project-agents",
        );
        yield* connection.request({ type: "switch_session", sessionPath: sessionFile });
        const resumed = parsePiDiscoveredCommands(
          yield* connection.request({ type: "get_commands" }),
        );
        assert.include(
          resumed.skills.map((skill) => skill.name),
          "project-agents",
        );
        assert.include(
          resumed.skills.map((skill) => skill.name),
          "added-later",
        );
        assert.include(
          JSON.stringify(yield* connection.request({ type: "get_messages" })),
          "PROJECT_AGENTS",
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
