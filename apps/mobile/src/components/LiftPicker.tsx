import { exerciseKey, MUSCLES, type Kit, type Lift, type Muscle } from '@sandbag/shared';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useData } from '@/data/store';
import { activeLogged, buildHistory } from '@/domain/history';
import { liftChoices } from '@/domain/lifts';
import { colors, fonts, radius, space } from '@/theme';
import { BodyMap, MUSCLE_NAMES } from './BodyMap';
import { Icon } from './icons';
import { feel } from './motion';
import { Sheet } from './Sheet';
import { Chip, Label, ListGroup, ListRow, Row } from './ui';

const KIT_NAMES: Record<Kit, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', 'plate-loaded': 'Plate-loaded', cable: 'Cable', bodyweight: 'Bodyweight',
};
const KITS = Object.keys(KIT_NAMES) as Kit[];
const RECENT_SHOWN = 6;

const about = (lift: Lift | undefined) => (lift ? [KIT_NAMES[lift.kit], ...lift.muscles.map((muscle) => MUSCLE_NAMES[muscle])].join(' · ') : 'Your own lift');

/** Lift names you've logged, the latest first. */
function useKnownLifts(): string[] {
  const logged = useData((state) => state.logged);
  return useMemo(
    () => [...buildHistory(activeLogged(logged)).values()]
      .sort((a, b) => (b.log.at(-1)?.date ?? '').localeCompare(a.log.at(-1)?.date ?? ''))
      .map((item) => item.name),
    [logged],
  );
}

/**
 * Search, tap a muscle, or type your own. What you type is added as you typed it:
 * the catalog only suggests, so a near miss is offered as "did you mean", never swapped in.
 */
export function LiftPicker({ visible, onClose, exclude, onPick }: {
  visible: boolean;
  onClose: () => void;
  /** Names already in the workout. */
  exclude: string[];
  onPick: (name: string) => void;
}) {
  const known = useKnownLifts();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [asWords, setAsWords] = useState(false);
  const typed = query.trim();
  const browsing = Boolean(typed) || muscle !== null;

  const { choices, meant, typedIsOffered } = useMemo(
    () => liftChoices({ query, muscle, kit, known, exclude }),
    [query, muscle, kit, known, exclude],
  );
  // Only kit that something here is done on. Barbell abs isn't a choice worth making.
  const kits = useMemo(() => {
    const here = new Set(liftChoices({ query, muscle, kit: null, known, exclude }).choices.map((choice) => choice.lift?.kit));
    return KITS.filter((item) => here.has(item));
  }, [query, muscle, known, exclude]);
  const taken = new Set(exclude.map(exerciseKey));
  const recent = known.filter((name) => !taken.has(exerciseKey(name))).slice(0, RECENT_SHOWN);

  const reset = () => {
    setQuery('');
    setMuscle(null);
    setKit(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const pick = (name: string) => {
    feel.tap();
    onPick(name);
    reset();
  };
  const pickMuscle = (next: Muscle | null) => {
    feel.tap();
    setMuscle(next);
    setKit(null);
  };

  return (
    <Sheet visible={visible} onClose={close} title={muscle ? MUSCLE_NAMES[muscle] : 'Add a lift'}>
      <View style={styles.top}>
        {muscle && !typed ? (
          <Pressable accessibilityRole="button" accessibilityLabel="All muscles" hitSlop={6} onPress={() => pickMuscle(null)} style={styles.back}>
            <Icon name="back" size={22} color={colors.volt} />
          </Pressable>
        ) : null}
        <TextInput
          accessibilityLabel="Search lifts, or type your own"
          placeholder="Search, or type your own"
          placeholderTextColor={colors.ink3}
          maxLength={100}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => typed && pick(typed)}
          returnKeyType="done"
          style={styles.input}
        />
      </View>

      {!browsing ? (
        <>
          {recent.length ? (
            <Row style={styles.wrap}>
              {recent.map((name) => <Chip key={name} title={name} onPress={() => pick(name)} />)}
            </Row>
          ) : null}
          <Label style={styles.centre}>Or tap a muscle</Label>
          {asWords ? (
            <Row style={styles.wrap}>
              {MUSCLES.map((item) => <Chip key={item} title={MUSCLE_NAMES[item]} onPress={() => pickMuscle(item)} />)}
            </Row>
          ) : <BodyMap size={140} onPick={pickMuscle} />}
          <Pressable accessibilityRole="button" onPress={() => setAsWords(!asWords)} style={styles.swap}>
            <Text style={styles.link}>{asWords ? 'Show the body' : 'List the muscles instead'}</Text>
          </Pressable>
        </>
      ) : null}

      {browsing && kits.length > 1 ? (
        <Row style={styles.wrap}>
          {kits.map((item) => <Chip key={item} title={KIT_NAMES[item]} active={kit === item} onPress={() => { feel.tap(); setKit(kit === item ? null : item); }} />)}
        </Row>
      ) : null}

      {meant ? (
        <ListGroup>
          <ListRow title={`Did you mean ${meant.name}?`} body={about(meant.lift)} onPress={() => pick(meant.name)} />
        </ListGroup>
      ) : null}

      {browsing && choices.length ? (
        <ListGroup>
          {choices.map((choice) => <ListRow key={choice.name} title={choice.name} body={about(choice.lift)} onPress={() => pick(choice.name)} />)}
        </ListGroup>
      ) : null}

      {typed && !typedIsOffered ? (
        <ListGroup>
          <ListRow icon="plus" title={`Add “${typed}”`} body="As your own lift" onPress={() => pick(typed)} />
        </ListGroup>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { width: 36, height: 52, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 52, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
  wrap: { flexWrap: 'wrap' },
  centre: { textAlign: 'center' },
  swap: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
});
