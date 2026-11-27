import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useContext, useState } from "react";
import { View } from "react-native";

import { AppText } from "../AppText";
import { AppTextInput } from "../AppTextInput";
import { connectedEnvironmentAtom } from "../board/files";
import { ChoiceButton } from "../foryou/ChoiceButton";
import { forYouEngine, stopTurn } from "../state/threads";
import { styles } from "../styles";

export function Composer({
  environmentId,
  threadId,
  live,
  onSend,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  live: boolean;
  onSend: () => void;
}) {
  const registry = useContext(RegistryContext);
  const connected = useAtomValue(connectedEnvironmentAtom) === environmentId;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = draft.trim();

  // A command sent over a dropped socket waits for it with no sign, so the composer refuses it up front.
  const run = async (action: () => Promise<string | null>, onDone?: () => void) => {
    if (!connected) {
      setError("Not connected to the engine. Try again once the header reads Connected.");
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await action();
    setBusy(false);
    if (failure === null) onDone?.();
    else setError(failure);
  };

  return (
    <View style={styles.composer}>
      <View style={styles.composerRow}>
        <AppTextInput
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          multiline
          placeholder="Message the orchestrator"
          accessibilityLabel="Message the orchestrator"
          style={styles.composerInput}
        />
        {live ? (
          <ChoiceButton
            primary
            disabled={busy}
            onPress={() => void run(() => stopTurn(registry, environmentId, threadId))}
          >
            Stop
          </ChoiceButton>
        ) : (
          <ChoiceButton
            primary
            disabled={busy || text === ""}
            onPress={() => {
              onSend();
              void run(
                () => forYouEngine(registry, environmentId, threadId).message(async () => text),
                () => setDraft(""),
              );
            }}
          >
            {busy ? "Sending" : "Send"}
          </ChoiceButton>
        )}
      </View>
      {error !== null && (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}
    </View>
  );
}
