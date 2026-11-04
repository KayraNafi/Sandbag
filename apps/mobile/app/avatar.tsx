import type { AvatarId } from '@sandbag/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { AVATAR_IDS, AVATAR_NAMES, AvatarArt } from '@/components/Avatar';
import { feel, Pop, Stamp } from '@/components/motion';
import { toast } from '@/components/Toast';
import { Muted, Screen } from '@/components/ui';
import { colors, fonts, space } from '@/theme';

const SIZE = 84;
const BIG = 168;

export default function AvatarPicker() {
  const me = useSession((state) => state.me);
  const client = useQueryClient();
  const choose = useMutation({
    mutationFn: (avatar: AvatarId) => api.updateMe({ avatar }),
    onSuccess: (updated) => {
      useSession.getState().setMe(updated);
      toast(`${AVATAR_NAMES[updated.avatar]}. Bold choice.`);
      return client.invalidateQueries();
    },
    onError: (error) => toast(errorText(error)),
  });
  const current = choose.isPending ? choose.variables : me?.avatar;

  return (
    <Screen padTop={false}>
      {current ? (
        // Keyed by the pick, so each new one pops in and gets its name stamped on.
        <View style={styles.hero}>
          <Pop key={current} style={styles.big}><AvatarArt id={current} size={BIG} /></Pop>
          <Stamp key={`${current}-name`} delay={120} style={styles.stamp}><Text style={styles.stampText}>{AVATAR_NAMES[current].toUpperCase()}</Text></Stamp>
        </View>
      ) : null}
      <Muted style={styles.center}>Your crew sees this next to your name. Any resemblance to you is aspirational.</Muted>
      <View style={styles.grid}>
        {AVATAR_IDS.map((id) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: current === id }}
            accessibilityLabel={AVATAR_NAMES[id]}
            onPress={() => {
              feel.tick();
              choose.mutate(id);
            }}
            style={[styles.option, current === id && styles.selected]}
          >
            <View style={styles.art}><AvatarArt id={id} size={SIZE} /></View>
            <Text style={styles.name}>{AVATAR_NAMES[id]}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginVertical: space.sm },
  big: { width: BIG, height: BIG, borderRadius: BIG / 2, overflow: 'hidden' },
  stamp: { marginTop: -18, paddingHorizontal: space.md, paddingVertical: 2, borderWidth: 3, borderColor: colors.volt, borderRadius: 6, backgroundColor: colors.bg },
  stampText: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.volt },
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  option: { width: 108, alignItems: 'center', gap: space.xs, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: 16, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface },
  selected: { borderColor: colors.volt },
  art: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
  name: { fontFamily: fonts.bodyStrong, fontSize: 13, color: colors.ink, textAlign: 'center' },
});
