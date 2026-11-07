import { MAX_VARIED_SETS } from '@sandbag/shared';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DragList } from '@/components/DragList';
import { feel } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { SupersetList } from '@/components/Superset';
import { Button, Chip, Field, Label, Muted, Row } from '@/components/ui';
import { jumpFor, JUMPS, usePrefs } from '@/data/prefs';
import { useData } from '@/data/store';
import { backfillDates, dayLabel, num } from '@/domain/format';
import { activeLogged, buildHistory, recentWeights, type Draft, type DraftEntry } from '@/domain/history';
import { setAt, ticksOf, warmupSets, withSetCount, withSetValue } from '@/domain/sets';
import { colors, fonts, radius, space } from '@/theme';

const NOTE_MAX = 200;

function JumpChips({ name }: { name: string }) {
  const current = usePrefs((state) => jumpFor(state.jumps, name));
  const setJump = usePrefs((state) => state.setJump);
  return (
    <Row style={styles.wrap}>
      {JUMPS.map((jump) => <Chip key={jump} title={`${num(jump)} kg`} active={current === jump} onPress={() => { feel.tap(); setJump(name, jump); }} />)}
    </Row>
  );
}

/** Everything about one lift that isn't today's numbers. Opened from its name. */
export function LiftSheet({ entry, onChange, onRemove, onClose }: {
  entry: DraftEntry | undefined;
  onChange: (changes: Partial<DraftEntry>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const logged = useData((state) => state.logged);
  const [more, setMore] = useState(false);
  const weights = useMemo(() => (entry ? recentWeights(buildHistory(activeLogged(logged)), entry.name) : []), [logged, entry]);
  const close = () => {
    setMore(false);
    onClose();
  };
  const open = entry ? ticksOf(entry).findIndex((tick) => !tick) : -1;
  return (
    <Sheet visible={Boolean(entry)} onClose={close} title={entry ? `${entry.name} setup` : ''} footer={<Button title="Done" onPress={close} />}>
      {entry ? (
        <>
          <Muted>Remembered for next time, so this only needs setting once.</Muted>
          {entry.kind === 'strength' ? (
            <>
              <Stepper variant="large" label="Sets" value={ticksOf(entry).length} step={1} max={MAX_VARIED_SETS} decimals={false} onChange={(sets) => {
                if (sets && sets >= 1) onChange(withSetCount(entry, sets));
              }} />
              {weights.length > 1 ? (
                <>
                  <Label>Weights you’ve used</Label>
                  <Row style={styles.wrap}>
                    {weights.map((weight) => (
                      <Chip key={weight} title={num(weight)} active={open >= 0 && setAt(entry, open).weight === weight} onPress={() => {
                        if (open >= 0) onChange(withSetValue(entry, open, 'weight', weight, { onward: true, fold: true }));
                      }} />
                    ))}
                  </Row>
                </>
              ) : null}
              <Label>Weight jumps</Label>
              <JumpChips name={entry.name} />
            </>
          ) : null}
          <Field label="Note" placeholder="Seat at 4" maxLength={NOTE_MAX} value={entry.note} onChangeText={(note) => onChange({ note })} />
          {more || entry.kind === 'time' ? (
            <>
              <Label>What is it?</Label>
              <Row style={styles.wrap}>
                <Chip title="Weights" active={entry.kind === 'strength'} onPress={() => onChange({ kind: 'strength' })} />
                <Chip title="Timed" active={entry.kind === 'time'} onPress={() => onChange({ kind: 'time' })} />
              </Row>
            </>
          ) : <Button title="More settings" variant="ghost" onPress={() => { feel.tap(); setMore(true); }} />}
          {more && entry.kind === 'strength' ? (
            <>
              <Label>The weight you enter is</Label>
              <Row style={styles.wrap}>
                <Chip title="The total" active={!entry.perSide} onPress={() => onChange({ perSide: false })} />
                <Chip title="Each side" active={entry.perSide} onPress={() => onChange({ perSide: true })} />
              </Row>
              <Label>Bar or machine weight</Label>
              <Row style={styles.wrap}>
                <Chip title="Included" active={entry.includesEquipment === true} onPress={() => onChange({ includesEquipment: entry.includesEquipment === true ? undefined : true })} />
                <Chip title="Not included" active={entry.includesEquipment === false} onPress={() => onChange({ includesEquipment: entry.includesEquipment === false ? undefined : false })} />
              </Row>
              <Muted>Changing these starts this lift’s progress again, because the numbers no longer compare.</Muted>
            </>
          ) : null}
          <Button title="Remove from today" variant="danger" onPress={() => {
            setMore(false);
            onRemove();
          }} />
        </>
      ) : null}
    </Sheet>
  );
}

export function JumpSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  return (
    <Sheet visible={Boolean(name)} onClose={onClose} title="Weight jumps" footer={<Button title="Done" onPress={onClose} />}>
      <Muted>The smallest step {name ?? 'this lift'} can go up by at your gym.</Muted>
      {name ? <JumpChips name={name} /> : null}
      <Muted>Something odder, like 4.5 kg? Tap the number and type it.</Muted>
    </Sheet>
  );
}

export function WarmupSheet({ warmup, onClose }: { warmup: { weight: number; jump: number } | null; onClose: () => void }) {
  return (
    <Sheet visible={Boolean(warmup)} onClose={onClose} title="Warm up" footer={<Button title="Got it" onPress={onClose} />}>
      <Muted>The way up to {warmup ? num(warmup.weight) : ''} kg. None of it gets logged, because nobody’s counting these.</Muted>
      {warmup ? warmupSets(warmup.weight, warmup.jump).map((step) => (
        <View key={step.weight} style={styles.warmRow}>
          <Text style={styles.warmValue}>{num(step.weight)} × {step.reps}</Text>
        </View>
      )) : null}
    </Sheet>
  );
}

/** The workout as a whole: finish early, its name and day, the order, the layout, or throw it away. */
export function WorkoutSheet({ visible, draft, finishLabel, onFinish, onRename, onRedate, onMove, onLink, onListView, onDiscard, onClose }: {
  visible: boolean;
  draft: Draft;
  /** Absent when there's nothing ticked to finish with. */
  finishLabel: string | null;
  onFinish: () => void;
  onRename: (title: string) => void;
  onRedate: (date: string) => void;
  onMove: (from: number, to: number) => void;
  onLink: (at: number, on: boolean) => void;
  onListView: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="This workout" footer={<Button title="Done" onPress={onClose} />}>
      {finishLabel ? <Button title={finishLabel} variant="ghost" onPress={onFinish} /> : null}
      <Field label="Name" maxLength={100} value={draft.title} onChangeText={onRename} />
      {!draft.editing ? (
        <>
          <Label>Which day?</Label>
          <Muted>Forgot to log one? Pick the day you trained.</Muted>
          <Row style={styles.wrap}>
            {backfillDates().map((date) => <Chip key={date} title={dayLabel(date)} active={date === draft.date} onPress={() => onRedate(date)} />)}
          </Row>
        </>
      ) : null}
      {draft.entries.length > 1 ? (
        <>
          <Label>Order</Label>
          <DragList
            items={draft.entries}
            keyOf={(entry) => entry.id}
            label={(entry) => entry.name}
            renderItem={(entry) => <View style={styles.orderRow}><Text style={styles.name}>{entry.name}</Text></View>}
            onMove={onMove}
          />
          <Label>Supersets</Label>
          <Muted>Tap between two lifts to do them back to back.</Muted>
          <SupersetList items={draft.entries} keyOf={(entry) => entry.id} onLink={onLink}>
            {(entry) => <View style={styles.orderRow}><Text style={styles.name}>{entry.name}</Text></View>}
          </SupersetList>
        </>
      ) : null}
      <Button title="Switch to list view" variant="ghost" onPress={onListView} />
      <Button title="Discard workout" variant="danger" onPress={onDiscard} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap' },
  warmRow: { gap: 2, paddingVertical: space.sm },
  warmValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  orderRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
