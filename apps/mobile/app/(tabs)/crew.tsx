import { voice, type PublicUser } from '@sandbag/shared';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/icons';
import { feel, Pop } from '@/components/motion';
import { PostCard } from '@/components/PostCard';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Toast';
import { Button, Empty, Loading, Muted, Row, Screen, Title } from '@/components/ui';
import { colors, fonts, space } from '@/theme';

const DAY_MS = 86_400_000;

export default function Crew() {
  const feed = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.length ? page.at(-1)?.createdAt : undefined),
  });
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.friends });
  const [person, setPerson] = useState<PublicUser | null>(null);
  const nudge = useMutation({
    mutationFn: (friend: PublicUser) => api.nudge(friend.id),
    onSuccess: (_, friend) => {
      setPerson(null);
      feel.win();
      toast(voice.nudgeSent(friend.displayName, Date.now()));
    },
    onError: (error) => {
      setPerson(null);
      toast(errorText(error));
    },
  });
  const posts = feed.data?.pages.flat() ?? [];
  const empty = feed.isSuccess && !posts.length && !friends.isPending;
  // Only an answer from the server says someone has no crew. A failed check doesn't.
  const alone = friends.isSuccess && !friends.data.length;
  const now = Date.now();
  const active = new Set(posts.filter((post) => now - Date.parse(post.createdAt) < DAY_MS).map((post) => post.author.id));
  const showedUp = friends.data?.filter((friend) => active.has(friend.id)).length ?? 0;

  return (
    <Screen onRefresh={() => Promise.all([feed.refetch(), friends.refetch()])}>
      <Title>Crew</Title>
      {friends.data?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {friends.data.map((friend, index) => {
            const on = active.has(friend.id);
            return (
              <Pressable key={friend.id} accessibilityRole="button" accessibilityLabel={`${friend.displayName}${on ? ', trained today' : ', not yet today'}`} onPress={() => {
                feel.tap();
                // Lit means there's a post to go and look at. Dark means there's a nudge to send.
                const latest = posts.find((post) => post.author.id === friend.id);
                if (on && latest) router.push(`/post/${latest.id}`);
                else setPerson(friend);
              }} style={styles.person}>
                <Pop delay={index * 45} style={[styles.ring, on && styles.ringOn]}><Avatar user={friend} size={52} /></Pop>
                <Text numberOfLines={1} style={[styles.name, on && styles.nameOn]}>{friend.displayName}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="Bring witnesses" onPress={() => { feel.tap(); router.push('/invites'); }} style={styles.person}>
            <View style={styles.add}><Icon name="plus" size={24} color={colors.volt} /></View>
            <Text style={styles.nameOn}>Invite</Text>
          </Pressable>
        </ScrollView>
      ) : null}
      {friends.data?.length ? <Muted>{showedUp ? `${showedUp} of ${friends.data.length} showed up today.${showedUp < friends.data.length ? ' Tap anyone who hasn’t.' : ''}` : 'Nobody’s posted today. Tap someone and ask why.'}</Muted> : null}
      {feed.isPending || (feed.isSuccess && !posts.length && friends.isPending) ? <Loading /> : null}
      {feed.isError ? (
        <>
          <Muted>Can’t load the feed right now. Your own logging still works.</Muted>
          <Button title="Try again" variant="ghost" onPress={() => Promise.all([feed.refetch(), friends.refetch()])} />
        </>
      ) : null}
      {empty && alone ? (
        <>
          <Empty title="Nobody’s watching" body="Lifting with no witnesses is just a rumour. Invite someone." />
          <Button title="Bring witnesses" onPress={() => router.push('/invites')} />
        </>
      ) : null}
      {empty && !alone ? <Empty title="Your crew’s gone quiet" body="No posts yet. Finish a workout and show them, or they’ll assume the worst." /> : null}
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
      <Sheet
        visible={Boolean(person)}
        onClose={() => setPerson(null)}
        title={person?.displayName ?? ''}
        footer={person ? <Button title="Nudge" busy={nudge.isPending} onPress={() => nudge.mutate(person)} /> : null}
      >
        {person ? (
          <Row>
            <Avatar user={person} size={64} />
            <Muted style={styles.flex}>Nothing posted today. A nudge tells them you noticed. One a day, so make it count.</Muted>
          </Row>
        ) : null}
      </Sheet>
      {feed.hasNextPage && posts.length >= 30 ? (
        <Button title="Older" variant="ghost" busy={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  strip: { gap: space.md, paddingVertical: 2 },
  person: { width: 64, alignItems: 'center', gap: space.xs },
  ring: { padding: 3, borderRadius: 32, borderWidth: 2, borderColor: colors.line },
  ringOn: { borderColor: colors.volt },
  add: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line },
  name: { fontFamily: fonts.label, fontSize: 13, color: colors.ink3 },
  nameOn: { fontFamily: fonts.label, fontSize: 13, color: colors.volt },
});
