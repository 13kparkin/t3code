import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useTheme } from "@react-navigation/native";
import { useContext, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { connectedEnvironmentAtom } from "../board/files";
import { forYouEngine, stopTurn } from "../state/threads";
import { styles } from "../styles";

/** The box that messages the orchestrator, with Stop in place of Send while a turn runs. */
export function Composer({
  environmentId,
  threadId,
  live,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  live: boolean;
}) {
  const { colors } = useTheme();
  const registry = useContext(RegistryContext);
  const connected = useAtomValue(connectedEnvironmentAtom) === environmentId;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = draft.trim();

  const run = async (action: () => Promise<string | null>, onDone?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const failure = await action();
      if (failure === null) onDone?.();
      else setError(failure);
    } finally {
      setBusy(false);
    }
  };

  // A turn sent over a dropped socket waits for it with no sign, so the draft stays for a later send.
  const send = () =>
    run(
      async () =>
        connected
          ? forYouEngine(registry, environmentId, threadId).message(async () => text)
          : "Not connected to the engine. Your message is kept; send it again once the header reads Connected.",
      () => setDraft(""),
    );

  return (
    <View style={styles.composer}>
      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.composerRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          multiline
          placeholder="Message the orchestrator"
          accessibilityLabel="Message the orchestrator"
          placeholderTextColor={colors.border}
          style={[
            styles.input,
            styles.composerInput,
            { borderColor: colors.border, color: colors.text },
          ]}
        />
        {live ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run(() => stopTurn(registry, environmentId, threadId))}
            style={[styles.button, busy && styles.muted]}
          >
            <Text style={styles.buttonText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={busy || text === ""}
            onPress={() => void send()}
            style={[styles.button, (busy || text === "") && styles.muted]}
          >
            <Text style={styles.buttonText}>{busy ? "Sending" : "Send"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
