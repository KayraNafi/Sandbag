import { CALL_DAYS, CALLABLE_DAYS, DAY_MS } from '@sandbag/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { confirm } from '@/components/confirm';
import { PostActions, PostEntries } from '@/components/PostCard';
import { toast } from '@/components/Toast';
import { Button, Card, Chip, Field, Heading, Loading, Muted, Row, Screen } from '@/components/ui';
import { useData } from '@/data/store';
import { agoLong, agoShort } from '@/domain/format';
import { Avatar } from '@/components/Avatar';
import { colors, fonts, space } from '@/theme';

const LINE_MAX = 140;

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
      router.back();
    },
    onError: (error) => toast(errorText(error)),
  });

  if (post.isPending) return <Screen padTop={false}><Loading /></Screen>;
  if (!post.data) return <Screen padTop={false}><Muted>This post is gone, or isn’t for you.</Muted></Screen>;
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
      <Heading>{data.title}</Heading>
      {data.caption ? <Text style={styles.caption}>{data.caption}</Text> : null}
      <Card><PostEntries post={data} /></Card>
      <Row style={styles.wrap}>
        <PostActions post={data} />
        <Muted>{data.saveCount} saved · {data.callCount} called</Muted>
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
  wrap: { flexWrap: 'wrap' },
  author: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
  caption: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  call: { backgroundColor: colors.warnBg, borderColor: colors.warnLine },
  reply: { alignItems: 'flex-start', marginBottom: space.xs },
});
