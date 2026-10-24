import type { OrchestrationV2ProviderExtensionUi } from "@t3tools/contracts";
import { useState } from "react";
import { Button } from "../ui/button";

export function ProviderExtensionPanel(props: {
  ui: OrchestrationV2ProviderExtensionUi | null;
  placement: "aboveEditor" | "belowEditor";
  canApply: boolean;
  onApply: (text: string) => void;
}) {
  const [dismissedEditor, setDismissedEditor] = useState<string | null>(null);
  const ui = props.ui;
  if (!ui) return null;
  const above = props.placement === "aboveEditor";
  const editor = above && ui.editor?.id !== dismissedEditor ? ui.editor : null;
  const widgets = ui.widgets.filter((widget) => widget.placement === props.placement);
  if (
    widgets.length === 0 &&
    (!above || (!ui.title && ui.statuses.length === 0 && ui.notices.length === 0 && !editor))
  )
    return null;
  return (
    <aside
      aria-label="Agent extension updates"
      className="my-2 max-h-60 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs text-foreground"
    >
      {above && ui.title ? <p className="font-medium">{ui.title}</p> : null}
      {above
        ? ui.statuses.map((status) => (
            <p key={status.key} className="whitespace-pre-wrap">
              {status.text}
            </p>
          ))
        : null}
      {widgets.map((widget) => (
        <p key={widget.key} className="whitespace-pre-wrap font-mono">
          {widget.lines.join("\n")}
        </p>
      ))}
      {above
        ? ui.notices.map((notice) => (
            <p
              key={notice.id}
              role={notice.level === "error" ? "alert" : "status"}
              className="whitespace-pre-wrap"
            >
              {notice.message}
            </p>
          ))
        : null}
      {editor ? (
        <div>
          <p>Pi prepared editor text. Apply it to replace the current draft.</p>
          <pre className="max-h-24 overflow-auto whitespace-pre-wrap">
            {editor.text.slice(0, 1_000) || "(Empty draft)"}
            {editor.text.length > 1_000 ? "…" : ""}
          </pre>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!props.canApply}
              onClick={() => {
                props.onApply(editor.text);
                setDismissedEditor(editor.id);
              }}
            >
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDismissedEditor(editor.id)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
