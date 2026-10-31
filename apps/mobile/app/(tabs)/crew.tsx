import { useInfiniteQuery } from '@tanstack/react-query';
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
  const posts = feed.data?.pages.flat() ?? [];

  return (
    <Screen onRefresh={() => feed.refetch()}>
      <Title>Crew</Title>
      {feed.isPending ? <Loading /> : null}
      {feed.isError ? <Muted>Can’t load the feed right now. Your own logging still works.</Muted> : null}
      {feed.isSuccess && !posts.length ? (
        <>
          <Empty title="Nobody’s watching" body="Lifting with no witnesses is just a rumour. Invite someone." />
          <Button title="Bring witnesses" onPress={() => router.push('/invites')} />
        </>
      ) : null}
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
      {feed.hasNextPage && posts.length >= 30 ? (
        <Button title="Older" variant="ghost" busy={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}
