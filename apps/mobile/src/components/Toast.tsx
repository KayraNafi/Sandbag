import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, fonts, radius, space } from '@/theme';
import { Pop } from './motion';

const SHOWN_MS = 3500;
const UNDO_MS = 7000;

const useToast = create<{ text: string | null; stamp: number; undo: (() => void) | null }>(() => ({ text: null, stamp: 0, undo: null }));

export function toast(text: string, undo: (() => void) | null = null): void {
  useToast.setState({ text, stamp: Date.now(), undo });
}

export function ToastHost() {
  const { text, stamp, undo } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!text) return undefined;
    const timer = setTimeout(() => useToast.setState({ text: null, undo: null }), undo ? UNDO_MS : SHOWN_MS);
    return () => clearTimeout(timer);
  }, [text, stamp, undo]);
  if (!text) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space.sm }]}>
      <Pop key={stamp}>
        <View accessibilityLiveRegion="polite" style={styles.toast}>
          <Text textBreakStrategy="simple" style={styles.text}>{text}</Text>
          {undo ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={() => { undo(); useToast.setState({ text: null, undo: null }); }} style={styles.undo}>
              <Text style={styles.undoText}>UNDO</Text>
            </Pressable>
          ) : null}
        </View>
      </Pop>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg },
  toast: { backgroundColor: colors.volt, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk },
  undo: { minWidth: 44, minHeight: 44, marginVertical: -space.md + 4, alignItems: 'center', justifyContent: 'center' },
  undoText: { fontFamily: fonts.display, fontSize: 17, color: colors.voltInk },
});
