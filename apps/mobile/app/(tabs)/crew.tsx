import { voice, type PostView, type PublicUser } from '@sandbag/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { confirm } from '@/components/confirm';
import { Icon } from '@/components/icons';
import { feel, Pop } from '@/components/motion';
import { PostCard } from '@/components/PostCard';
import { toast } from '@/components/Toast';
import { Button, Empty, Loading, Muted, Screen, Title } from '@/components/ui';
import { toIsoDate, today } from '@/domain/format';
import { colors, fonts, space } from '@/theme';

/** Same stagger as the notifications, so the row arrives the way the rest of the app does. */
const STAGGER_MS = 45;

/** Who you nudged today, so a second tap says so instead of asking first. The server has the final say. */
const nudged = { day: '', ids: new Set<string>() };

async function nudge(friend: PublicUser) {
  if (nudged.day !== today()) Object.assign(nudged, { day: today(), ids: new Set<string>() });
  if (nudged.ids.has(friend.id)) {
    toast('You already nudged them today. Let them live.');
    return;
  }
  if (!(await confirm(`Nudge ${friend.displayName}?`, 'Nothing posted today. A nudge tells them you noticed. One a day, so make it count.', 'Nudge', { danger: false }))) return;
  try {
    await api.nudge(friend.id);
    nudged.ids.add(friend.id);
    feel.win();
    toast(voice.nudgeSent(friend.displayName, Date.now()));
  } catch (error) {
    toast(errorText(error));
  }
}

/** Everyone in your crew, lit up if they posted a workout today. Lit opens it, dark offers a nudge. */
function TodayRow({ friends, posts }: { friends: PublicUser[]; posts: PostView[] }) {
  const day = today();
  // The feed is newest first, so this keeps each person's latest workout from today.
  const latest = new Map<string, PostView>();
  for (const post of posts) {
    if (post.kind === 'workout' && toIsoDate(new Date(post.createdAt)) === day && !latest.has(post.author.id)) latest.set(post.author.id, post);
  }
  const showedUp = friends.filter((friend) => latest.has(friend.id)).length;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {friends.map((friend, index) => {
          const post = latest.get(friend.id);
          return (
            <Pressable
              key={friend.id}
              accessibilityRole="button"
              accessibilityLabel={post ? `${friend.displayName}, trained today` : `${friend.displayName}, not yet today. Nudge`}
              onPress={() => {
                feel.tap();
                if (post) router.push(`/post/${post.id}`);
                else void nudge(friend);
              }}
              style={styles.person}
            >
              <Pop delay={Math.min(index, 8) * STAGGER_MS} style={[styles.ring, post && styles.ringOn]}><Avatar user={friend} size={52} /></Pop>
              <Text numberOfLines={1} style={[styles.name, post && styles.nameOn]}>{friend.displayName}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Bring witnesses" onPress={() => { feel.tap(); router.push('/invites'); }} style={styles.person}>
          <View style={styles.add}><Icon name="plus" size={24} color={colors.volt} /></View>
          <Text style={styles.nameOn}>Invite</Text>
        </Pressable>
      </ScrollView>
      <Muted>
        {showedUp
          ? `${showedUp} of ${friends.length} showed up today.${showedUp < friends.length ? ' Tap anyone who hasn’t.' : ''}`
          : 'Nobody’s posted today. Tap someone and ask why.'}
      </Muted>
    </>
  );
}

export default function Crew() {
  const feed = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.length ? page.at(-1)?.createdAt : undefined),
  });
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.friends });
  const posts = feed.data?.pages.flat() ?? [];
  const empty = feed.isSuccess && !posts.length && !friends.isPending;
  // Only an answer from the server says someone has no crew. A failed check doesn't.
  const alone = friends.isSuccess && !friends.data.length;

  return (
    <Screen onRefresh={() => Promise.all([feed.refetch(), friends.refetch()])}>
      <Title>Crew</Title>
      {friends.data?.length ? <TodayRow friends={friends.data} posts={posts} /> : null}
      {feed.isPending || (feed.isSuccess && !posts.length && friends.isPending) ? <Loading /> : null}
      {feed.isError ? <Muted>Can’t load the feed right now. Your own logging still works.</Muted> : null}
      {empty && alone ? (
        <>
          <Empty title="Nobody’s watching" body="Lifting with no witnesses is just a rumour. Invite someone." />
          <Button title="Bring witnesses" onPress={() => router.push('/invites')} />
        </>
      ) : null}
      {empty && !alone ? <Empty title="Your crew’s gone quiet" body="No posts yet. Finish a workout and show them, or they’ll assume the worst." /> : null}
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
      {feed.hasNextPage && posts.length >= 30 ? (
        <Button title="Older" variant="ghost" busy={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.md, paddingVertical: 2 },
  person: { width: 64, alignItems: 'center', gap: space.xs },
  ring: { padding: 3, borderRadius: 32, borderWidth: 2, borderColor: colors.line },
  ringOn: { borderColor: colors.volt },
  add: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line },
  name: { fontFamily: fonts.label, fontSize: 13, color: colors.ink3 },
  nameOn: { fontFamily: fonts.label, fontSize: 13, color: colors.volt },
});
