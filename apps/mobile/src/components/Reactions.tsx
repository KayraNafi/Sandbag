import { REACTIONS, withMyReaction, type Reaction, type ReactionGroup } from '@sandbag/shared';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/auth/session';
import { isolate } from '@/domain/format';
import { colors, fonts, space } from '@/theme';
import { Burst, feel } from './motion';

/**
 * Reactions as the person tapping sees them: their tap shows at once, then the server's answer replaces it.
 * `send` gets the emoji, or null to take theirs back.
 */
export function useReacting(groups: ReactionGroup[], send: (emoji: Reaction | null) => Promise<unknown>, refresh: QueryKey[]) {
  const me = useSession((state) => state.me);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: send,
    onSettled: () => Promise.all(refresh.map((queryKey) => client.invalidateQueries({ queryKey }))),
  });
  const shown = mutation.isPending && me ? withMyReaction(groups, me, mutation.variables ?? null) : groups;
  return { groups: shown, react: mutation.mutate };
}

/** The emoji people answered with and how many, plus a button to add yours. With `who`, the names under them. */
export function Reactions({ groups, onReact, who = false }: { groups: ReactionGroup[]; onReact: (emoji: Reaction | null) => void; who?: boolean }) {
  const [picking, setPicking] = useState(false);
  const [fire, setFire] = useState(0);
  const mine = groups.find((group) => group.byMe)?.emoji;

  const choose = (emoji: Reaction) => {
    feel.tick();
    // Giving one is the moment worth celebrating. Taking it back is quiet.
    if (mine !== emoji) setFire((shot) => shot + 1);
    onReact(mine === emoji ? null : emoji);
    setPicking(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {groups.map((group) => (
          <Pressable
            key={group.emoji}
            accessibilityRole="button"
            accessibilityState={{ selected: group.byMe }}
            accessibilityLabel={`${group.emoji} ${group.users.length}`}
            onPress={() => choose(group.emoji)}
            style={[styles.chip, group.byMe && styles.chipOn]}
          >
            <Text style={styles.emoji}>{group.emoji}</Text>
            <Text style={[styles.count, group.byMe && styles.countOn]}>{group.users.length}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: picking }}
          accessibilityLabel="React"
          onPress={() => setPicking(!picking)}
          style={[styles.chip, picking && styles.chipOn]}
        >
          <Text style={[styles.count, picking && styles.countOn]}>{groups.length ? '＋' : 'React'}</Text>
        </Pressable>
        <Burst fire={fire} spread={0.45} />
      </View>
      {picking ? (
        <View style={styles.picker}>
          {REACTIONS.map((emoji) => (
            <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={emoji} onPress={() => choose(emoji)} style={[styles.option, mine === emoji && styles.chipOn]}>
              <Text style={styles.optionEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {who ? groups.map((group) => (
        <Text key={group.emoji} style={styles.who}>
          {group.emoji}  {group.users.map((user) => isolate(user.displayName)).join(', ')}
        </Text>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chip: { minHeight: 36, minWidth: 44, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, borderRadius: 18, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.volt, borderColor: colors.volt },
  emoji: { fontSize: 16 },
  count: { fontFamily: fonts.label, fontSize: 14, color: colors.ink },
  countOn: { color: colors.voltInk },
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, padding: space.sm, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  option: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  optionEmoji: { fontSize: 24 },
  who: { fontFamily: fonts.body, fontSize: 14, color: colors.ink2 },
});
