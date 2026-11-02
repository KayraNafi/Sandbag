import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { PostCard } from '@/components/PostCard';
import { Button, Empty, Loading, Muted, Screen, Title } from '@/components/ui';

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
