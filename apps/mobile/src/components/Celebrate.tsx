import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { colors, fonts, space } from '@/theme';
import { Burst, feel, Stamp } from './motion';

const HOLD_MS = 1500;

const useCelebrate = create<{ text: string | null; stamp: number }>(() => ({ text: null, stamp: 0 }));

/** For the moments that deserve the whole screen. Toasts are for everything else. */
export function celebrate(text: string): void {
  feel.win();
  useCelebrate.setState({ text, stamp: Date.now() });
}

export function CelebrateHost() {
  const { text, stamp } = useCelebrate();
  useEffect(() => {
    if (!text) return undefined;
    const timer = setTimeout(() => useCelebrate.setState({ text: null }), HOLD_MS);
    return () => clearTimeout(timer);
  }, [text, stamp]);
  if (!text) return null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.host}>
      <Burst fire={stamp} big />
      <Stamp key={stamp} style={styles.stamp}><Text style={styles.text}>{text}</Text></Stamp>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  stamp: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderWidth: 4, borderColor: colors.volt, borderRadius: 8, backgroundColor: colors.bg },
  text: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },
});
