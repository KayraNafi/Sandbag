import type { PostView } from '@sandbag/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { agoShort, num } from '@/domain/format';
import { previewLoad, trustedEntries } from '@/domain/history';
import { Avatar } from './Avatar';
import { BodyMap } from './BodyMap';
import { Icon } from './icons';
import { Burst, feel, Stamp, usePulse } from './motion';
import { colors, fonts, space } from '@/theme';
import { Card, Muted, Row } from './ui';

/** One line per post keeps the feed readable. The whole session is a tap away. */
function headline(post: PostView): string {
  const count = `${post.entries.length} ${post.entries.length === 1 ? 'lift' : 'lifts'}`;
  const top = trustedEntries(post.entries).find((entry) => entry.weight !== null);
  return post.kind === 'workout' && post.showWeights && top?.weight ? `${count} · ${top.name} ${num(top.weight)} kg` : `${count}: ${post.entries.slice(0, 3).map((entry) => entry.name).join(', ')}`;
}

export function PostActions({ post }: { post: PostView }) {
  const client = useQueryClient();
  const respect = useMutation({
    mutationFn: () => api.respect(post.id, !post.respectedByMe),
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['feed'] }), client.invalidateQueries({ queryKey: ['post', post.id] })]),
  });
  const on = respect.isPending ? !post.respectedByMe : post.respectedByMe;
  const count = post.respects + (on === post.respectedByMe ? 0 : on ? 1 : -1);
  const [fire, setFire] = useState(0);
  const scale = usePulse(on, 1.14);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`Respect, ${count}`}
        onPress={() => {
          feel.tick();
          if (!on) setFire((shot) => shot + 1);
          respect.mutate();
        }}
        style={[styles.action, on && styles.actionOn]}
      >
        <Text style={[styles.actionText, on && styles.actionTextOn]}>Respect {count}</Text>
      </Pressable>
      <Burst fire={fire} spread={0.45} />
    </Animated.View>
  );
}

/** The heaviest thing in the session, or the plan if there are no numbers to show. */
function topLift(post: PostView) {
  if (post.kind !== 'workout' || !post.showWeights) return null;
  return trustedEntries(post.entries).filter((entry) => entry.weight !== null).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0] ?? null;
}

export function PostCard({ post }: { post: PostView }) {
  const top = topLift(post);
  const called = post.kind === 'workout' && post.callCount > 0;
  return (
    <Card style={called ? styles.called : undefined} label={`${post.author.displayName}: ${post.title}`} onPress={() => router.push(`/post/${post.id}`)}>
      <Row>
        <Avatar user={post.author} />
        <View style={styles.flex}>
          <Text style={styles.author}>{post.author.displayName}</Text>
          <Muted>{agoShort(post.createdAt)}</Muted>
        </View>
        {called ? <Stamp delay={300}><Text style={styles.calledStamp}>CALLED</Text></Stamp> : null}
      </Row>
      <View style={styles.body}>
        <View style={styles.flex}>
          <Text numberOfLines={2} style={styles.title}>{post.title.toUpperCase()}</Text>
          {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
          {top?.weight ? (
            <View style={styles.top}>
              <Text style={styles.topWeight}>{num(top.weight)}</Text>
              <Text style={styles.topUnit}>KG</Text>
            </View>
          ) : null}
          <Muted numberOfLines={2}>{top ? (post.entries.length > 1 ? `${top.name}, and ${post.entries.length - 1} more` : top.name) : headline(post)}</Muted>
        </View>
        <BodyMap size={44} levels={previewLoad(post.entries)} />
      </View>
      <Row style={styles.footer}>
        <PostActions post={post} />
        <View style={styles.flex} />
        <Icon name="reply" size={18} color={colors.ink3} />
        <Text style={styles.stat}>{post.replyCount}</Text>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  author: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink },
  body: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: space.xs },
  topWeight: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },
  topUnit: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3 },
  called: { borderColor: colors.warnLine, backgroundColor: colors.warnBg },
  calledStamp: { paddingHorizontal: space.sm, borderWidth: 2, borderColor: colors.warn, borderRadius: 4, fontFamily: fonts.display, fontSize: 17, lineHeight: 22, color: colors.warn },
  stat: { fontFamily: fonts.label, fontSize: 15, color: colors.ink2 },
  caption: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  footer: { marginTop: space.xs },
  action: { minHeight: 44, paddingHorizontal: space.md, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  actionOn: { backgroundColor: colors.volt, borderColor: colors.volt },
  actionText: { fontFamily: fonts.label, fontSize: 15, color: colors.ink },
  actionTextOn: { color: colors.voltInk },
});
