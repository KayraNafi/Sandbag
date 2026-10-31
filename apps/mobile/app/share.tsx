import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { toast } from '@/components/Toast';
import { Button, Chip, Field, Heading, Label, Muted, Row, Screen } from '@/components/ui';
import { newId } from '@/data/actions';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';

const CAPTION_MAX = 140;

export default function Share() {
  const { loggedId, savedId } = useLocalSearchParams<{ loggedId?: string; savedId?: string }>();
  const logged = useData((state) => (loggedId ? state.logged[loggedId] : undefined));
  const saved = useData((state) => (savedId ? state.saved[savedId] : undefined));
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.friends });
  const [caption, setCaption] = useState('');
  const [showWeights, setShowWeights] = useState(true);
  const [recipients, setRecipients] = useState<string[]>([]);
  const toggle = (id: string) => setRecipients((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

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
      showWeights: isTemplate ? false : showWeights, entries, recipientIds: recipients,
    });
    void syncNow();
    toast(isTemplate ? 'Shared. Your numbers stay with you.' : 'Posted. Now it’s on the record.');
    router.back();
  };

  return (
    <Screen padTop={false} footer={<Button title={recipients.length ? `Send to ${recipients.length}` : 'Send to the crew'} onPress={send} />}>
      <Heading>{title}</Heading>
      <Muted>{isTemplate ? 'They get the exercises and none of your weights. Theirs load from their own history.' : 'Friends can respect it, reply to it, or call sandbag on it.'}</Muted>
      <Field label="Caption" placeholder="Say something you’ll regret" maxLength={CAPTION_MAX} value={caption} onChangeText={setCaption} />
      {isTemplate ? null : (
        <>
          <Label>Weights</Label>
          <Row>
            <Chip title="Show" active={showWeights} onPress={() => setShowWeights(true)} />
            <Chip title="Hide" active={!showWeights} onPress={() => setShowWeights(false)} />
          </Row>
        </>
      )}
      <Label>Who sees it</Label>
      <Muted>Pick nobody to send it to your whole crew.</Muted>
      <Row style={{ flexWrap: 'wrap' }}>
        {friends.data?.map((friend) => (
          <Chip key={friend.id} title={friend.displayName} active={recipients.includes(friend.id)} onPress={() => toggle(friend.id)} />
        ))}
      </Row>
      {friends.isError ? <Muted>Can’t load your crew while offline. It’ll go to everyone.</Muted> : null}
    </Screen>
  );
}
