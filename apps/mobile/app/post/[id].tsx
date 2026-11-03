import { entryMax, MAX_OPEN_CALLS } from '@sandbag/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { celebrate } from '@/components/Celebrate';
import { confirm } from '@/components/confirm';
import { PostActions } from '@/components/PostCard';
import { toast } from '@/components/Toast';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/icons';
import { LiftRow } from '@/components/LiftRow';
import { FadeIn, feel } from '@/components/motion';
import { BodyMap } from '@/components/BodyMap';
import { Button, Card, Chip, Field, Heading, Label, Loading, Muted, Row, Screen, ShowMore, useShowMore } from '@/components/ui';
import { useData } from '@/data/store';
import { agoLong, agoShort, num, setsReps } from '@/domain/format';
import { previewLoad, trustedEntry } from '@/domain/history';
import { Avatar } from '@/components/Avatar';
import { colors, fonts, radius, space } from '@/theme';

const LINE_MAX = 140;
const LIFTS_PAGE = 8;

export default function PostScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const me = useSession((state) => state.me);
  const client = useQueryClient();
  const post = useQuery({ queryKey: ['post', id], queryFn: () => api.post(id) });
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const [reply, setReply] = useState('');
  const list = useShowMore(post.data?.entries.length ?? 0, LIFTS_PAGE);
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
    mutationFn: (name: string) => api.callSandbag(id, name, line),
    onSuccess: () => {
      setCalling(false);
      celebrate('CALLED');
      toast('Called. Their next session settles it.');
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
  const callable = data.entries.filter((entry) => entry.kind === 'strength' && (data.showWeights ? entryMax(entry) !== null : true));
  const target = lift ?? (callable.length === 1 ? callable[0]?.name : undefined);
  const targetEntry = callable.find((entry) => entry.name === target);
  const atLimit = (calls.data?.filter((item) => item.status === 'open' && item.caller.id === me?.id).length ?? 0) >= MAX_OPEN_CALLS;

  return (
    <Screen padTop={false} onRefresh={() => post.refetch()}>
      <Row>
        <Avatar user={data.author} size={48} />
        <View style={styles.flex}>
          <Text style={styles.author}>{data.author.displayName}</Text>
          <Muted>{agoLong(data.createdAt)}</Muted>
        </View>
      </Row>
      <View style={styles.hero}>
        <View style={styles.flex}>
          <Text numberOfLines={3} style={styles.title}>{data.title.toUpperCase()}</Text>
          {data.caption ? <Text style={styles.caption}>{data.caption}</Text> : null}
        </View>
        <BodyMap size={56} levels={previewLoad(data.entries)} />
      </View>
      <Card>
        {data.entries.slice(0, list.shown).map((entry, index) => (
          <LiftRow
            key={entry.id}
            name={entry.name}
            delay={index * 50}
            detail={data.kind === 'share' ? setsReps(entry) : !data.showWeights ? setsReps(entry) || 'Weights hidden' : trustedEntry(entry) === entry ? setsReps(entry) : [setsReps(entry), 'Not counted'].filter(Boolean).join(' · ')}
            value={data.kind === 'workout' && data.showWeights && entry.weight !== null ? num(entry.weight) : null}
          />
        ))}
      </Card>
      <ShowMore left={list.left} page={list.page} onPress={list.more} />
      <Row style={styles.wrap}>
        <PostActions post={data} />
        <Muted>{data.saveCount} saved · {data.callCount} called</Muted>
      </Row>

      {data.kind === 'share' && !mine ? (
        <Button title={data.savedByMe ? 'Already in your workouts' : 'Save to my workouts'} disabled={data.savedByMe} busy={save.isPending} onPress={() => save.mutate()} />
      ) : null}

      {data.kind === 'workout' && !mine && callable.length ? (
        <>
          <Button title="Call sandbag" style={styles.callButton} onPress={() => { feel.warn(); setCalling(true); }} />
          <Sheet
            visible={calling}
            onClose={() => setCalling(false)}
            title="Call sandbag"
            footer={<Button title={atLimit ? `${MAX_OPEN_CALLS} calls already open` : target ? `Call ${target}` : 'Call it'} disabled={atLimit || !target || !line.trim()} busy={call.isPending} onPress={() => { if (target) call.mutate(target); }} />}
          >
            <Muted>{atLimit ? 'Wait for a verdict on one of them first. Nobody likes a serial accuser.' : `They have two weeks to beat ${data.showWeights && targetEntry?.weight ? `${num(targetEntry.weight)} kg${targetEntry.reps ? ` × ${targetEntry.reps}` : ''}` : 'this number'}.`}</Muted>
            <Row>
              <View style={[styles.stake, styles.stakeWin]}>
                <Text style={styles.stakeNumber}>+5</Text>
                <Text style={styles.stakeLabel}>IF THEY DON’T. THEY WEAR THE BADGE.</Text>
              </View>
              <View style={[styles.stake, styles.stakeLose]}>
                <Text style={[styles.stakeNumber, styles.stakeLoseNumber]}>−3</Text>
                <Text style={styles.stakeLabel}>IF THEY DO. YOU LOOK SILLY.</Text>
              </View>
            </Row>
            {callable.length > 1 ? (
              <>
                <Label>Which lift looks too easy?</Label>
                <Row style={styles.wrap}>
                  {callable.map((entry) => <Chip key={entry.id} title={entry.name} active={lift === entry.name} onPress={() => setLift(entry.name)} />)}
                </Row>
              </>
            ) : null}
            <Field label="Your accusation" maxLength={LINE_MAX} value={line} onChangeText={setLine} />
          </Sheet>
        </>
      ) : null}

      <Heading section>Replies</Heading>
      {data.replies.length ? null : <Muted>Nobody’s said anything yet. Be the problem.</Muted>}
      {data.replies.map((item, index) => {
        const own = item.author.id === me?.id;
        return (
          <FadeIn key={item.id} delay={Math.min(index, 6) * 40}>
            <Row style={[styles.reply, own && styles.replyOwn]}>
              <Avatar user={item.author} size={32} />
              <View style={[styles.bubble, own && styles.bubbleOwn]}>
                <Text style={[styles.bubbleName, own && styles.bubbleTextOwn]}>{item.author.displayName} <Text style={[styles.time, own && styles.bubbleTextOwn]}>{agoShort(item.createdAt)}</Text></Text>
                <Text style={[styles.caption, own && styles.bubbleTextOwn]}>{item.text}</Text>
              </View>
            </Row>
          </FadeIn>
        );
      })}
      <Row style={styles.composer}>
        <TextInput
          accessibilityLabel="Reply"
          placeholder="Say something"
          placeholderTextColor={colors.ink3}
          maxLength={LINE_MAX}
          value={reply}
          onChangeText={setReply}
          onSubmitEditing={() => { if (reply.trim()) sendReply.mutate(); }}
          style={styles.composerInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!reply.trim() || sendReply.isPending}
          onPress={() => { feel.tick(); sendReply.mutate(); }}
          style={[styles.send, !reply.trim() && styles.sendOff]}
        >
          <Icon name="chevron" size={22} color={reply.trim() ? colors.voltInk : colors.ink3} />
        </Pressable>
      </Row>
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
  author: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.ink3 },
  caption: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  callButton: { backgroundColor: colors.warn, minHeight: 60 },
  stake: { flex: 1, gap: 2, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  stakeWin: { backgroundColor: colors.doneBg, borderColor: colors.doneLine },
  stakeLose: { backgroundColor: colors.surface2, borderColor: colors.line },
  stakeNumber: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.volt },
  stakeLoseNumber: { color: colors.danger },
  stakeLabel: { fontFamily: fonts.label, fontSize: 12, lineHeight: 15, letterSpacing: 0.5, color: colors.ink2 },
  reply: { alignItems: 'flex-end' },
  replyOwn: { flexDirection: 'row-reverse' },
  bubble: { flexShrink: 1, gap: 2, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, borderBottomLeftRadius: 4, backgroundColor: colors.surface2 },
  bubbleOwn: { backgroundColor: colors.volt, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: 4 },
  bubbleName: { fontFamily: fonts.bodyStrong, fontSize: 13, color: colors.ink2 },
  bubbleTextOwn: { color: colors.voltInk },
  composer: { marginTop: space.sm },
  composerInput: { flex: 1, minHeight: 52, paddingHorizontal: space.lg, borderRadius: 26, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, fontFamily: fonts.body, fontSize: 17, color: colors.ink },
  send: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.volt },
  sendOff: { backgroundColor: colors.surface2 },
});
