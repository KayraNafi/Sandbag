import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, fonts, radius, space } from '@/theme';

const useToast = create<{ text: string | null; stamp: number }>(() => ({ text: null, stamp: 0 }));

export function toast(text: string): void {
  useToast.setState({ text, stamp: Date.now() });
}

export function ToastHost() {
  const { text, stamp } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!text) return undefined;
    const timer = setTimeout(() => useToast.setState({ text: null }), 3500);
    return () => clearTimeout(timer);
  }, [text, stamp]);
  if (!text) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + space.sm }]}>
      <View accessibilityLiveRegion="polite" style={styles.toast}>
        <Text textBreakStrategy="simple" style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg },
  toast: { backgroundColor: colors.volt, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg, alignSelf: 'stretch' },
  text: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk },
});
