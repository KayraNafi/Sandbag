import { ListLog } from '@/components/log/ListLog';
import { StepLog } from '@/components/log/StepLog';
import { Button, Heading, Screen } from '@/components/ui';
import { usePrefs } from '@/data/prefs';
import { useData } from '@/data/store';
import { leave } from '@/nav';

/** The workout in progress, in the layout chosen in Settings. Both edit the same draft. */
export default function ActiveWorkout() {
  const draft = useData((state) => state.draft);
  const logging = usePrefs((state) => state.logging);
  if (!draft) {
    return (
      <Screen padTop={false}>
        <Heading>Nothing in progress</Heading>
        <Button title="Back" variant="ghost" onPress={leave} />
      </Screen>
    );
  }
  return logging === 'steps' ? <StepLog draft={draft} /> : <ListLog draft={draft} />;
}
