import { describe, expect, it } from "vite-plus/test";
import { emptyPiExtensionUi, updatePiExtensionUi } from "./presentation.ts";

describe("Pi RPC presentation", () => {
  it("replaces and clears keyed status and widgets while preserving placement", () => {
    let state = emptyPiExtensionUi();
    state = updatePiExtensionUi(state, { method: "setStatus", statusKey: "a", statusText: "old" });
    state = updatePiExtensionUi(state, { method: "setStatus", statusKey: "a", statusText: "new" });
    expect(state.statuses).toEqual([{ key: "a", text: "new" }]);
    state = updatePiExtensionUi(state, {
      method: "setWidget",
      widgetKey: "w",
      widgetLines: ["one"],
      widgetPlacement: "belowEditor",
    });
    expect(state.widgets).toEqual([{ key: "w", lines: ["one"], placement: "belowEditor" }]);
    state = updatePiExtensionUi(state, { method: "setStatus", statusKey: "a" });
    state = updatePiExtensionUi(state, { method: "setWidget", widgetKey: "w" });
    expect(state.statuses).toEqual([]);
    expect(state.widgets).toEqual([]);
  });

  it("preserves exact editor text including an explicit empty draft and rejects oversized edits", () => {
    const initial = updatePiExtensionUi(emptyPiExtensionUi(), {
      method: "set_editor_text",
      id: "a",
      text: "  draft\n",
    });
    expect(initial.editor).toEqual({ id: "a", text: "  draft\n" });
    const empty = updatePiExtensionUi(initial, { method: "set_editor_text", id: "b", text: "" });
    expect(empty.editor).toEqual({ id: "b", text: "" });
    const rejected = updatePiExtensionUi(empty, {
      method: "set_editor_text",
      id: "c",
      text: "x".repeat(256001),
    });
    expect(rejected.editor).toEqual(empty.editor);
    expect(rejected.notices[0]?.level).toBe("error");
  });

  it("bounds untrusted display state and leaves interactive requests to their request handler", () => {
    let state = emptyPiExtensionUi();
    for (let i = 0; i < 30; i++) {
      state = updatePiExtensionUi(state, {
        method: "setStatus",
        statusKey: String(i),
        statusText: "x".repeat(2000),
      });
      state = updatePiExtensionUi(state, {
        method: "notify",
        id: String(i),
        message: "m".repeat(5000),
        notifyType: "warning",
      });
    }
    expect(state.statuses).toHaveLength(16);
    expect(state.statuses[0]?.text).toHaveLength(1000);
    expect(state.notices).toHaveLength(8);
    expect(state.notices[0]?.message).toHaveLength(4000);
    expect(updatePiExtensionUi(state, { method: "confirm", title: "Allow?" })).toBe(state);
  });
});
