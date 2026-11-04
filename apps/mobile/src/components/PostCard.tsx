import type { PostView } from '@sandbag/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { agoShort, setsReps, summary } from '@/domain/format';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './icons';
import { Burst, feel, Stamp } from './motion';
import { colors, fonts, space } from '@/theme';
import { Card, Muted, Row } from './ui';

const PREVIEW = 4;

export function PostActions({ post }: { post: PostView }) {
  const client = useQueryClient();
  const respect = useMutation({
    mutationFn: () => api.respect(post.id, !post.respectedByMe),
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['feed'] }), client.invalidateQueries({ queryKey: ['post', post.id] })]),
  });
  const [fire, setFire] = useState(0);
  const on = respect.isPending ? !post.respectedByMe : post.respectedByMe;
  const count = post.respects + (on === post.respectedByMe ? 0 : on ? 1 : -1);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`Respect, ${count}`}
        onPress={() => {
          feel.tick();
          // Giving it is the moment worth celebrating. Taking it back is quiet.
          if (!on) setFire((shot) => shot + 1);
          respect.mutate();
        }}
        style={[styles.action, on && styles.actionOn]}
      >
        <Text style={[styles.actionText, on && styles.actionTextOn]}>Respect {count}</Text>
      </Pressable>
      <Burst fire={fire} spread={0.45} />
    </View>
  );
}

export function PostEntries({ post, limit }: { post: PostView; limit?: number }) {
  const shown = limit ? post.entries.slice(0, limit) : post.entries;
  return (
    <View style={styles.entries}>
      {shown.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <Text style={styles.entryName}>{entry.name}</Text>
          <Muted style={styles.entryValue}>
            {post.kind === 'share' ? setsReps(entry) : post.showWeights ? summary(entry) : setsReps(entry) || 'Weights hidden'}
          </Muted>
        </View>
      ))}
      {post.entries.length > shown.length ? <Muted>+{post.entries.length - shown.length} more</Muted> : null}
    </View>
  );
}

function Stat({ icon, count, label }: { icon: IconName; count: number; label: string }) {
  return (
    <View accessible accessibilityLabel={`${count} ${label}`} style={styles.stat}>
      <Icon name={icon} size={18} color={colors.ink3} />
      <Text style={styles.statText}>{count}</Text>
    </View>
  );
}

export function PostCard({ post }: { post: PostView }) {
  // Only while someone is still waiting on a verdict. The post page has the rest.
  const called = post.kind === 'workout' && post.liveCalls > 0;
  return (
    <Card style={called ? styles.called : undefined}>
      {/* Respect sits below the link, not inside it: a button can't hold other buttons. */}
      <Pressable accessibilityRole="button" accessibilityLabel={`${post.author.displayName}: ${post.title}`} onPress={() => router.push(`/post/${post.id}`)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Row>
          <Avatar user={post.author} />
          <View style={styles.flex}>
            <Text style={styles.author}>{post.author.displayName}</Text>
            <Muted>{post.kind === 'share' ? `shared a workout · ${agoShort(post.createdAt)}` : agoShort(post.createdAt)}</Muted>
          </View>
          {called ? <Stamp delay={300}><Text style={styles.stamp}>CALLED</Text></Stamp> : null}
        </Row>
        <Text style={styles.title}>{post.title.toUpperCase()}</Text>
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        <PostEntries post={post} limit={PREVIEW} />
      </Pressable>
      <Row style={styles.footer}>
        <PostActions post={post} />
        <View style={styles.flex} />
        <Stat icon="reply" count={post.replyCount} label={post.replyCount === 1 ? 'reply' : 'replies'} />
        {post.kind === 'share'
          ? <Stat icon="share" count={post.saveCount} label="saved" />
          : <Stat icon="bag" count={post.callCount} label={post.callCount === 1 ? 'call' : 'calls'} />}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  link: { gap: space.sm },
  pressed: { opacity: 0.75 },
  author: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.ink },
  caption: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  entries: { gap: space.xs },
  entry: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  entryName: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 14, color: colors.ink },
  entryValue: { flexShrink: 1, textAlign: 'right' },
  footer: { marginTop: space.xs },
  called: { borderColor: colors.warnLine, backgroundColor: colors.warnBg },
  stamp: { paddingHorizontal: space.sm, borderWidth: 2, borderColor: colors.warn, borderRadius: 4, fontFamily: fonts.display, fontSize: 17, lineHeight: 22, color: colors.warn },
  stat: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  statText: { fontFamily: fonts.label, fontSize: 15, color: colors.ink2 },
  action: { minHeight: 44, paddingHorizontal: space.md, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  actionOn: { backgroundColor: colors.volt, borderColor: colors.volt },
  actionText: { fontFamily: fonts.label, fontSize: 14, color: colors.ink },
  actionTextOn: { color: colors.voltInk },
});
