import type { AvatarId } from '@sandbag/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { AVATAR_IDS, AVATAR_NAMES, AvatarArt } from '@/components/Avatar';
import { feel, Pop, Stamp } from '@/components/motion';
import { toast } from '@/components/Toast';
import { Muted, Screen, Title } from '@/components/ui';
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
      <Title>Pick your fighter</Title>
      {current ? (
        <View style={styles.hero}>
          <Pop key={current} style={styles.big}><AvatarArt id={current} size={BIG} /></Pop>
          <Stamp key={`${current}-name`} delay={120} style={styles.stamp}><Text style={styles.stampText}>{AVATAR_NAMES[current].toUpperCase()}</Text></Stamp>
        </View>
      ) : null}
      <Muted style={styles.middle}>Your crew sees this next to your name. Any resemblance to you is aspirational.</Muted>
      <View style={styles.grid}>
        {AVATAR_IDS.map((id, index) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: current === id }}
            accessibilityLabel={AVATAR_NAMES[id]}
            onPress={() => {
              feel.tick();
              choose.mutate(id);
            }}
            style={styles.option}
          >
            <Pop delay={Math.min(index, 12) * 30} style={[styles.ring, current === id && styles.ringOn]}>
              <View style={styles.art}><AvatarArt id={id} size={SIZE} /></View>
            </Pop>
            <Text numberOfLines={1} style={[styles.name, current === id && styles.nameOn]}>{AVATAR_NAMES[id]}</Text>
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
  middle: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, marginTop: space.sm },
  option: { width: '33.33%', alignItems: 'center', gap: space.xs },
  ring: { padding: 3, borderRadius: SIZE, borderWidth: 3, borderColor: 'transparent' },
  ringOn: { borderColor: colors.volt },
  art: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
  name: { fontFamily: fonts.label, fontSize: 15, color: colors.ink3, textAlign: 'center' },
  nameOn: { color: colors.volt },
});
