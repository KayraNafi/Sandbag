import { Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { Button } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme';

interface ConfirmRequest {
  title: string;
  message: string;
  action: string;
  answer: (sure: boolean) => void;
}

const useConfirm = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

/** Asks before something destructive. Anything but pressing the action counts as no. */
export function confirm(title: string, message: string, action: string): Promise<boolean> {
  Keyboard.dismiss();
  useConfirm.getState().request?.answer(false);
  return new Promise((resolve) => {
    useConfirm.setState({ request: { title, message, action, answer: resolve } });
  });
}

export function ConfirmHost() {
  const request = useConfirm((state) => state.request);
  if (!request) return null;
  const answer = (sure: boolean) => {
    useConfirm.setState({ request: null });
    request.answer(sure);
  };
  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => answer(false)}>
      <View style={styles.host}>
        <Pressable accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={() => answer(false)} />
        <View accessibilityViewIsModal style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{request.title}</Text>
          <Text style={styles.message}>{request.message}</Text>
          <View style={styles.buttons}>
            <Button title={request.action} variant="danger" onPress={() => answer(true)} />
            <Button title="Cancel" variant="ghost" onPress={() => answer(false)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  message: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink2 },
  buttons: { gap: space.sm, marginTop: space.sm },
});
