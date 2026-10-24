import type { OrchestrationV2ProviderExtensionUi } from "@t3tools/contracts";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";

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
    <ScrollView
      accessibilityLabel="Agent extension updates"
      nestedScrollEnabled
      style={{ maxHeight: 220 }}
      className="my-2 rounded-xl bg-secondary px-3 py-2"
    >
      {above && ui.title ? (
        <Text className="font-t3-medium text-foreground">{ui.title}</Text>
      ) : null}
      {above
        ? ui.statuses.map((status) => (
            <Text key={status.key} className="text-foreground">
              {status.text}
            </Text>
          ))
        : null}
      {widgets.map((widget) => (
        <Text key={widget.key} className="font-mono text-foreground">
          {widget.lines.join("\n")}
        </Text>
      ))}
      {above
        ? ui.notices.map((notice) => (
            <Text
              key={notice.id}
              accessibilityRole={notice.level === "error" ? "alert" : undefined}
              className="text-foreground"
            >
              {notice.message}
            </Text>
          ))
        : null}
      {editor ? (
        <View>
          <Text className="text-foreground">
            Pi prepared editor text. Apply it to replace the current draft.
          </Text>
          <Text className="text-foreground-muted">
            {editor.text.slice(0, 1_000) || "(Empty draft)"}
            {editor.text.length > 1_000 ? "…" : ""}
          </Text>
          <View className="flex-row gap-2">
            <Button
              label="Apply"
              disabled={!props.canApply}
              onPress={() => {
                props.onApply(editor.text);
                setDismissedEditor(editor.id);
              }}
            />
            <Button label="Dismiss" tone="text" onPress={() => setDismissedEditor(editor.id)} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
