import { OrchestrationV2ProviderExtensionUi } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { piRecordString, type PiRpcRecord } from "./rpc.ts";

export type PiExtensionUiState = Omit<
  OrchestrationV2ProviderExtensionUi,
  "providerSessionId" | "nativeThreadId"
>;

export const piExtensionUiEqual = Schema.toEquivalence(
  OrchestrationV2ProviderExtensionUi.mapFields(
    ({ providerSessionId: _providerSessionId, nativeThreadId: _nativeThreadId, ...fields }) =>
      fields,
  ),
);

export function emptyPiExtensionUi(): PiExtensionUiState {
  return { title: null, statuses: [], widgets: [], editor: null, notices: [] };
}

/** Decorations are bounded display state; editor text is rejected rather than silently truncated. */
export function updatePiExtensionUi(
  state: PiExtensionUiState,
  event: PiRpcRecord,
): PiExtensionUiState {
  const method = piRecordString(event, "method");
  const id = piRecordString(event, "id") ?? "pi-notice";
  if (method === "setTitle")
    return { ...state, title: (piRecordString(event, "title") ?? "").slice(0, 256) || null };
  if (method === "setStatus") {
    const key = piRecordString(event, "statusKey");
    if (!key || key.length > 256) return state;
    const text = piRecordString(event, "statusText");
    const statuses = state.statuses.filter((status) => status.key !== key);
    if (text) statuses.push({ key, text: text.slice(0, 1_000) });
    return { ...state, statuses: statuses.slice(-16) };
  }
  if (method === "setWidget") {
    const key = piRecordString(event, "widgetKey");
    if (!key || key.length > 256) return state;
    const lines = event["widgetLines"];
    const widgets = state.widgets.filter((widget) => widget.key !== key);
    if (
      Array.isArray(lines) &&
      lines.every((line) => typeof line === "string") &&
      lines.length > 0
    ) {
      widgets.push({
        key,
        lines: lines.slice(0, 32).map((line) => line.slice(0, 500)),
        placement: event["widgetPlacement"] === "belowEditor" ? "belowEditor" : "aboveEditor",
      });
    }
    return { ...state, widgets: widgets.slice(-8) };
  }
  if (method === "set_editor_text") {
    const text = piRecordString(event, "text");
    if (text === undefined) return state;
    if (text.length > 256_000)
      return updatePiExtensionUi(state, {
        type: "extension_ui_request",
        id,
        method: "notify",
        message: "Pi's editor update exceeds the 256,000-character limit and was not applied.",
        notifyType: "error",
      });
    return { ...state, editor: { id, text } };
  }
  if (method === "notify") {
    const message = piRecordString(event, "message");
    if (!message) return state;
    const level: PiExtensionUiState["notices"][number]["level"] =
      event["notifyType"] === "error" || event["notifyType"] === "warning"
        ? event["notifyType"]
        : "info";
    return {
      ...state,
      notices: [
        ...state.notices.filter((notice) => notice.id !== id),
        { id, message: message.slice(0, 4_000), level },
      ].slice(-8),
    };
  }
  return state;
}
