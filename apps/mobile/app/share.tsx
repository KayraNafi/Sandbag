import { runHeadline, type NewPost } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { leave } from '@/nav';
import { toast } from '@/components/Toast';
import { Button, Chip, Field, Heading, Label, Muted, Row, Screen } from '@/components/ui';
import { newId } from '@/data/actions';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';
import { runSummary } from '@/domain/runs';

const CAPTION_MAX = 140;

type PostBase = Pick<NewPost, 'id' | 'caption' | 'recipientIds'>;

/** What's being shared: a session as it went, a saved workout without its numbers, or a run. Only a session can hide its weights. */
interface Shared {
  kind: NewPost['kind'];
  title: string;
  about: string;
  post: (base: PostBase, showWeights: boolean) => NewPost;
}

function useShared(): Shared | null {
  const { loggedId, savedId, runId } = useLocalSearchParams<{ loggedId?: string; savedId?: string; runId?: string }>();
  const logged = useData((state) => (loggedId ? state.logged[loggedId] : undefined));
  const saved = useData((state) => (savedId ? state.saved[savedId] : undefined));
  const run = useData((state) => (runId ? state.runs[runId] : undefined));
  if (run && !run.deleted) {
    return {
      kind: 'run',
      title: runHeadline(run),
      about: `${runSummary(run)}. Friends can respect it and reply to it.`,
      post: (base) => ({ ...base, kind: 'run', runId: run.id }),
    };
  }
  if (logged?.entries.length) {
    return {
      kind: 'workout',
      title: logged.title,
      about: 'Friends can respect it, reply to it, or call sandbag on it.',
      post: (base, showWeights) => ({ ...base, kind: 'workout', title: logged.title, showWeights, entries: logged.entries }),
    };
  }
  if (saved?.exercises.length) {
    const entries = saved.exercises.map((exercise) => ({ ...exercise, id: newId(), weight: null, perSide: false, rpe: null, minutes: null, note: '' }));
    return {
      kind: 'share',
      title: saved.name,
      about: 'They get the exercises and none of your weights. Theirs load from their own history.',
      post: (base) => ({ ...base, kind: 'share', title: saved.name, showWeights: false, entries }),
    };
  }
  return null;
}

const SENT: Record<Shared['kind'], string> = {
  workout: 'Posted. Now it’s on the record.',
  share: 'Shared. Your numbers stay with you.',
  run: 'Posted. Now everyone knows you run.',
};

export default function Share() {
  const shared = useShared();
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.friends });
  const [caption, setCaption] = useState('');
  const [showWeights, setShowWeights] = useState(true);
  const [recipients, setRecipients] = useState<string[]>([]);
  const toggle = (id: string) => setRecipients((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  if (!shared) return null;

  const send = () => {
    const base = { id: newId(), caption: caption.trim(), recipientIds: recipients };
    // Queued, so sharing from a basement gym still goes out later. It goes after the sync, so a new run is there first.
    useData.getState().enqueuePost(shared.post(base, showWeights));
    void syncNow();
    toast(SENT[shared.kind]);
    leave();
  };

  return (
    <Screen padTop={false} footer={<Button title={recipients.length ? `Send to ${recipients.length}` : 'Send to the crew'} onPress={send} />}>
      <Heading>{shared.title}</Heading>
      <Muted>{shared.about}</Muted>
      <Field label="Caption" placeholder="Say something you’ll regret" maxLength={CAPTION_MAX} value={caption} onChangeText={setCaption} />
      {shared.kind === 'workout' ? (
        <>
          <Label>Weights</Label>
          <Row>
            <Chip title="Show" active={showWeights} onPress={() => setShowWeights(true)} />
            <Chip title="Hide" active={!showWeights} onPress={() => setShowWeights(false)} />
          </Row>
        </>
      ) : null}
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
