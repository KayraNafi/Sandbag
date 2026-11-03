import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { BodyMap } from '@/components/BodyMap';
import { celebrate } from '@/components/Celebrate';
import { feel, Pop } from '@/components/motion';
import { toast } from '@/components/Toast';
import { Button, Card, Field, Label, Muted, Screen, Segmented } from '@/components/ui';
import { newId } from '@/data/actions';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';
import { plural } from '@/domain/format';
import { previewLoad } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

const CAPTION_MAX = 140;
const WEIGHTS = [{ key: 'show', label: 'Show my weights' }, { key: 'hide', label: 'Hide them' }] as const;

export default function ShareScreen() {
  const { loggedId, savedId } = useLocalSearchParams<{ loggedId?: string; savedId?: string }>();
  const logged = useData((state) => (loggedId ? state.logged[loggedId] : undefined));
  const saved = useData((state) => (savedId ? state.saved[savedId] : undefined));
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.friends });
  const [caption, setCaption] = useState('');
  const [weights, setWeights] = useState<'show' | 'hide'>('show');
  const [recipients, setRecipients] = useState<string[]>([]);
  const toggle = (id: string) => {
    feel.tap();
    setRecipients((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const title = logged?.title ?? saved?.name;
  const entries = logged?.entries ?? saved?.exercises.map((exercise) => ({
    ...exercise, id: newId(), weight: null, perSide: false, rpe: null, minutes: null, note: '',
  }));
  if (!title || !entries?.length) return null;
  const isTemplate = !logged;

  const send = () => {
    // Queued, so sharing from a basement gym still goes out later.
    useData.getState().enqueuePost({
      id: newId(), kind: isTemplate ? 'share' : 'workout', title, caption: caption.trim(),
      showWeights: isTemplate ? false : weights === 'show', entries, recipientIds: recipients,
    });
    void syncNow();
    celebrate(isTemplate ? 'SHARED' : 'ON THE RECORD');
    toast(isTemplate ? 'Shared. Your numbers stay with you.' : 'Posted. Friends can respect it, or call sandbag on it.');
    router.back();
  };

  return (
    <Screen padTop={false} footer={<Button title={recipients.length ? `Send to ${recipients.length}` : 'Send to the crew'} onPress={send} />}>
      <Card>
        <View style={styles.preview}>
          <View style={styles.flex}>
            <Text style={styles.title}>{title.toUpperCase()}</Text>
            <Muted>{plural(entries.length, 'lift')}</Muted>
          </View>
          <BodyMap size={44} levels={previewLoad(entries)} />
        </View>
      </Card>
      {isTemplate ? <Muted>They get the exercises and none of your weights. Theirs load from their own history.</Muted> : null}
      <Field label="Caption" placeholder="Say something you’ll regret" maxLength={CAPTION_MAX} value={caption} onChangeText={setCaption} />
      {isTemplate ? null : <Segmented options={[...WEIGHTS]} value={weights} onChange={setWeights} />}
      <Label>Who sees it</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.crew}>
        {friends.data?.map((friend) => {
          const on = recipients.includes(friend.id);
          return (
            <Pressable key={friend.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={friend.displayName} onPress={() => toggle(friend.id)} style={styles.person}>
              <Pop key={String(on)} style={[styles.ring, on && styles.ringOn]}><Avatar user={friend} size={56} /></Pop>
              <Text numberOfLines={1} style={[styles.name, on && styles.nameOn]}>{friend.displayName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Muted>{recipients.length ? `Only ${plural(recipients.length, 'person')} will see this.` : 'Pick nobody and your whole crew sees it.'}</Muted>
      {friends.isError ? <Muted>Can’t load your crew while offline. It’ll go to everyone.</Muted> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.ink },
  crew: { gap: space.md, paddingVertical: 2 },
  person: { width: 68, alignItems: 'center', gap: space.xs },
  ring: { padding: 3, borderRadius: 34, borderWidth: 2, borderColor: colors.line },
  ringOn: { borderColor: colors.volt },
  name: { fontFamily: fonts.label, fontSize: 13, color: colors.ink3 },
  nameOn: { color: colors.volt },
});
