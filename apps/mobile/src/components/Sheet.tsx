import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, space } from '@/theme';
import { EASE_OUT, NATIVE, prefersLessMotion } from './motion';

const CLOSED = 700;
/** Dragged this far down, or flicked, it goes. */
const DISMISS_DISTANCE = 110;
const DISMISS_SPEED = 0.8;

/** A bottom sheet: slides up, drags down, and a tap outside closes it. */
export function Sheet({ visible, onClose, title, children, footer }: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const offset = useRef(new Animated.Value(CLOSED)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (visible) setMounted(true);
    const duration = prefersLessMotion() ? 0 : visible ? 280 : 200;
    Animated.timing(offset, { toValue: visible ? 0 : CLOSED, duration, easing: EASE_OUT, useNativeDriver: NATIVE }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, offset]);

  const drag = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_SPEED) closeRef.current();
      else Animated.timing(offset, { toValue: 0, duration: 180, easing: EASE_OUT, useNativeDriver: NATIVE }).start();
    },
    onPanResponderTerminate: () => {
      Animated.timing(offset, { toValue: 0, duration: 180, easing: EASE_OUT, useNativeDriver: NATIVE }).start();
    },
  })).current;

  if (!mounted) return null;
  const backdrop = offset.interpolate({ inputRange: [0, CLOSED], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.host}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + space.md, transform: [{ translateY: offset }] }]}>
          <View {...drag.panHandlers} style={styles.grab}>
            <View style={styles.handle} />
            {title ? <Text accessibilityRole="header" style={styles.title}>{title.toUpperCase()}</Text> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  sheet: { maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg + 8, borderTopRightRadius: radius.lg + 8, borderTopWidth: 1, borderColor: colors.line },
  grab: { paddingTop: space.sm, paddingBottom: space.md, paddingHorizontal: space.lg, gap: space.md },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink },
  body: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
});
