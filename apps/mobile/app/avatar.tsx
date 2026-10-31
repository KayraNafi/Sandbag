import type { AvatarId } from '@sandbag/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { AVATAR_IDS, AVATAR_NAMES, AvatarArt } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { Muted, Screen } from '@/components/ui';
import { colors, fonts, space } from '@/theme';

const SIZE = 84;

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
      <Muted>Your crew sees this next to your name. Any resemblance to you is aspirational.</Muted>
      <View style={styles.grid}>
        {AVATAR_IDS.map((id) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: current === id }}
            accessibilityLabel={AVATAR_NAMES[id]}
            onPress={() => choose.mutate(id)}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  option: { width: 108, alignItems: 'center', gap: space.xs, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: 16, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface },
  selected: { borderColor: colors.volt },
  art: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
  name: { fontFamily: fonts.bodyStrong, fontSize: 13, color: colors.ink, textAlign: 'center' },
});
