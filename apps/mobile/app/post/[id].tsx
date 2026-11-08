import { CALL_DAYS, CALLABLE_DAYS, DAY_MS, type CallStatus, type CallView } from '@sandbag/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, ApiError, errorText } from '@/api/client';
import { leave } from '@/nav';
import { useSession } from '@/auth/session';
import { MusclesWorked } from '@/components/BodyMap';
import { confirm } from '@/components/confirm';
import { PostActions, PostBody } from '@/components/PostCard';
import { toast } from '@/components/Toast';
import { Button, Card, Chip, Field, Heading, Loading, Muted, Row, Screen } from '@/components/ui';
import { useData } from '@/data/store';
import { agoLong, agoShort, daysLeft } from '@/domain/format';
import { Avatar } from '@/components/Avatar';
import { colors, fonts, space } from '@/theme';

const LINE_MAX = 140;

/** Where a call on this post stands, told to anyone reading it. */
const VERDICT: Record<CallStatus, (target: string) => string> = {
  open: (target) => `Waiting on ${target}’s next session of it`,
  watching: (target) => `${target} just missed, at their limit. Watching.`,
  cleared: (target) => `${target} beat it`,
  failed: () => 'Sandbag confirmed',
  honest: () => 'An honest miss',
  caught: () => 'Caught sandbagging',
};

function CallRow({ call }: { call: CallView }) {
  const verdict = VERDICT[call.status](call.target.displayName);
  return (
    <Row style={styles.reply}>
      <Avatar user={call.caller} size={30} />
      <View style={styles.flex}>
        <Text style={styles.author}>{call.caller.displayName} called {call.exercise} <Text style={styles.time}>{agoShort(call.createdAt)}</Text></Text>
        <Text style={styles.caption}>“{call.line}”</Text>
        <Muted style={call.deadlineAt ? styles.live : undefined}>{call.deadlineAt ? `${verdict} · ${daysLeft(call.deadlineAt)}` : verdict}</Muted>
      </View>
    </Row>
  );
}

export default function PostScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const me = useSession((state) => state.me);
  const client = useQueryClient();
  const post = useQuery({ queryKey: ['post', id], queryFn: () => api.post(id) });
  const [reply, setReply] = useState('');
  const [calling, setCalling] = useState(false);
  const [lift, setLift] = useState<string>();
  const [line, setLine] = useState('That looked easy.');
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ['post', id] }),
    client.invalidateQueries({ queryKey: ['feed'] }),
  ]);

  const sendReply = useMutation({
    mutationFn: () => api.reply(id, reply),
    onSuccess: () => {
      setReply('');
      return refresh();
    },
    onError: (error) => toast(errorText(error)),
  });
  const save = useMutation({
    mutationFn: () => api.saveFromPost(id),
    onSuccess: (doc) => {
      useData.getState().mergeSaved(doc);
      toast('Added to your workouts. Your numbers, not theirs.');
      return refresh();
    },
    onError: (error) => toast(errorText(error)),
  });
  const call = useMutation({
    mutationFn: () => api.callSandbag(id, lift ?? '', line),
    onSuccess: () => {
      setCalling(false);
      toast(`Called. They have ${CALL_DAYS} days to answer it.`);
      return Promise.all([refresh(), client.invalidateQueries({ queryKey: ['calls'] })]);
    },
    onError: (error) => toast(errorText(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.deletePost(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['feed'] });
      leave();
    },
    onError: (error) => toast(errorText(error)),
  });

  if (post.isPending) return <Screen padTop={false}><Loading /></Screen>;
  if (!post.data) {
    // Only the server saying so means the post is gone. Anything else is a bad connection, worth another try.
    const gone = post.error instanceof ApiError && post.error.status === 404;
    return (
      <Screen padTop={false}>
        <Muted>{gone ? 'This post is gone, or isn’t for you.' : errorText(post.error)}</Muted>
        {gone ? null : <Button title="Try again" variant="ghost" busy={post.isFetching} onPress={() => post.refetch()} />}
      </Screen>
    );
  }
  const data = post.data;
  const mine = data.author.id === me?.id;
  // Only recent posts can be called, so nobody is held to a number from months ago.
  const recent = Date.now() - Date.parse(data.createdAt) <= CALLABLE_DAYS * DAY_MS;
  const callable = recent ? data.entries.filter((entry) => entry.kind === 'strength' && (entry.weight !== null || !data.showWeights)) : [];

  return (
    <Screen padTop={false} onRefresh={() => post.refetch()}>
      <Row>
        <Avatar user={data.author} />
        <View style={styles.flex}>
          <Text style={styles.author}>{data.author.displayName}</Text>
          <Muted>{agoLong(data.createdAt)}</Muted>
        </View>
      </Row>
      <Row style={styles.hero}>
        <View style={[styles.flex, styles.heading]}>
          <Heading>{data.title}</Heading>
          {data.caption ? <Text style={styles.caption}>{data.caption}</Text> : null}
        </View>
        <MusclesWorked entries={data.entries} size={72} />
      </Row>
      <Card><PostBody post={data} /></Card>
      <Row style={styles.wrap}>
        <PostActions post={data} />
        {data.kind === 'share' ? <Muted>{data.saveCount} saved</Muted> : null}
      </Row>

      {data.kind === 'share' && !mine ? (
        <Button title={data.savedByMe ? 'Already in your workouts' : 'Save to my workouts'} disabled={data.savedByMe} busy={save.isPending} onPress={() => save.mutate()} />
      ) : null}

      {data.kind === 'workout' && !mine && callable.length ? (
        calling ? (
          <Card style={styles.call}>
            <Heading>Which lift looks too easy?</Heading>
            <Row style={styles.wrap}>
              {callable.map((entry) => <Chip key={entry.id} title={entry.name} active={lift === entry.name} onPress={() => setLift(entry.name)} />)}
            </Row>
            <Field label="Your accusation" maxLength={LINE_MAX} value={line} onChangeText={setLine} />
            <Button title="Call sandbag" disabled={!lift || !line.trim()} busy={call.isPending} onPress={() => call.mutate()} />
            <Button title="Let it slide" variant="ghost" onPress={() => setCalling(false)} />
          </Card>
        ) : (
          <Button title="Call sandbag" variant="ghost" onPress={() => setCalling(true)} />
        )
      ) : null}

      {data.calls.length ? <Heading>Calls</Heading> : null}
      {data.calls.map((item) => <CallRow key={item.id} call={item} />)}

      <Heading>Replies</Heading>
      {data.replies.length ? null : <Muted>Nobody’s said anything yet. Be the problem.</Muted>}
      {data.replies.map((item) => (
        <Row key={item.id} style={styles.reply}>
          <Avatar user={item.author} size={30} />
          <View style={styles.flex}>
            <Text style={styles.author}>{item.author.displayName} <Text style={styles.time}>{agoShort(item.createdAt)}</Text></Text>
            <Text style={styles.caption}>{item.text}</Text>
          </View>
        </Row>
      ))}
      <Field label="Reply" maxLength={LINE_MAX} value={reply} onChangeText={setReply} />
      <Button title="Send" variant="ghost" disabled={!reply.trim()} busy={sendReply.isPending} onPress={() => sendReply.mutate()} />
      {mine ? (
        <Button title="Delete post" variant="danger" busy={remove.isPending} onPress={async () => {
          if (await confirm('Delete this post?', 'Replies and respect go with it. Your logged session stays.', 'Delete')) remove.mutate();
        }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'flex-start' },
  heading: { gap: space.sm },
  wrap: { flexWrap: 'wrap' },
  author: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  live: { color: colors.warn },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
  caption: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  call: { backgroundColor: colors.warnBg, borderColor: colors.warnLine },
  reply: { alignItems: 'flex-start', marginBottom: space.xs },
});
