import { EQUIPMENT, exercisesFor, type Equipment, type Muscle, cleanText } from '@sandbag/shared';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, space } from '@/theme';
import { BodyMap, MUSCLE_NAMES, MuscleChips } from './BodyMap';
import { EquipmentIcon, Icon } from './icons';
import { FadeIn, feel } from './motion';
import { Sheet } from './Sheet';
import { Chip } from './ui';

const EQUIPMENT_NAMES: Record<Equipment, string> = { barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight' };

/** Tap a muscle, narrow by what's free in the gym, tap a lift. Typing still works for anything else. */
export function ExercisePicker({ visible, recent, exclude, onPick, onClose }: {
  visible: boolean;
  /** Lifts this person has done, most useful first. */
  recent: string[];
  exclude: Set<string>;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [asWords, setAsWords] = useState(false);
  const typed = cleanText(query);
  const searching = typed.length > 0;
  const browsing = muscle !== null || searching;
  // Only offer kit that has something here. Barbell abs isn't a choice worth making.
  const kits = useMemo(() => {
    const here = new Set(exercisesFor(muscle, null, query).map((item) => item.equipment));
    return EQUIPMENT.filter((type) => here.has(type));
  }, [muscle, query]);
  const kit = equipment && kits.includes(equipment) ? equipment : null;
  const results = useMemo(() => {
    const found = exercisesFor(muscle, kit, query);
    if (searching) return found;
    // What you already do comes first.
    const rank = (name: string) => {
      const place = recent.indexOf(name);
      return place < 0 ? recent.length : place;
    };
    return [...found].sort((a, b) => rank(a.name) - rank(b.name));
  }, [muscle, kit, query, searching, recent]);
  const reset = () => {
    setQuery('');
    setMuscle(null);
    setEquipment(null);
  };
  const pick = (name: string) => {
    feel.tick();
    onPick(name);
    reset();
  };
  const exact = results.some((item) => item.name.toLowerCase() === typed.toLowerCase());

  return (
    <Sheet visible={visible} onClose={() => { reset(); onClose(); }} title={muscle ? MUSCLE_NAMES[muscle] : 'Add a lift'}>
      <View style={styles.top}>
        {muscle && !searching ? (
          <Pressable accessibilityRole="button" accessibilityLabel="All muscles" hitSlop={6} onPress={() => { feel.tap(); setMuscle(null); setEquipment(null); }} style={styles.back}>
            <Icon name="back" size={24} color={colors.volt} />
          </Pressable>
        ) : null}
        <View style={styles.search}>
          <Icon name="search" size={20} color={colors.ink3} />
          <TextInput
            accessibilityLabel="Search lifts"
            placeholder="Search, or type your own"
            placeholderTextColor={colors.ink3}
            maxLength={100}
            value={query}
            onChangeText={setQuery}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (typed) pick(results[0]?.name ?? typed);
            }}
            style={styles.input}
          />
        </View>
      </View>

      {!browsing ? (
        <>
          {recent.length ? (
            <View style={styles.recents}>
              {recent.filter((name) => !exclude.has(name)).slice(0, 4).map((name) => (
                <Pressable key={name} accessibilityRole="button" onPress={() => pick(name)} style={styles.recent}>
                  <Text numberOfLines={1} style={styles.recentText}>{name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.prompt}>TAP A MUSCLE</Text>
          {asWords
            ? <MuscleChips selected={muscle} onPick={setMuscle} />
            : <BodyMap selected={muscle} onPick={(next) => { feel.tap(); setMuscle(next); }} size={140} />}
          <Pressable accessibilityRole="button" onPress={() => { feel.tap(); setAsWords(!asWords); }} style={styles.swap}>
            <Text style={styles.backText}>{asWords ? 'Show the body' : 'List the muscles instead'}</Text>
          </Pressable>
        </>
      ) : null}

      {browsing && kits.length > 1 ? (
        <View style={styles.kit}>
          {kits.map((type) => <Chip key={type} title={EQUIPMENT_NAMES[type]} active={kit === type} onPress={() => { feel.tap(); setEquipment(kit === type ? null : type); }} />)}
        </View>
      ) : null}

      {browsing ? results.map((item, place) => {
        const added = exclude.has(item.name);
        const also = item.muscles.filter((name) => name !== muscle).map((name) => MUSCLE_NAMES[name]);
        return (
          <FadeIn key={item.name} delay={Math.min(place, 8) * 30}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name}`}
            disabled={added}
            onPress={() => pick(item.name)}
            style={({ pressed }) => [styles.result, pressed && styles.resultPressed, added && styles.added]}
          >
            <EquipmentIcon type={item.equipment} size={34} color={colors.volt} />
            <View style={styles.flex}>
              <Text style={styles.resultName}>{item.name}</Text>
              <Text style={styles.resultBody}>{[EQUIPMENT_NAMES[item.equipment], ...also].join(' · ')}</Text>
            </View>
            {added ? <Icon name="check" size={20} color={colors.ink3} /> : null}
          </Pressable>
          </FadeIn>
        );
      }) : null}

      {searching && !exact ? (
        <Pressable accessibilityRole="button" onPress={() => pick(typed)} style={styles.result}>
          <Icon name="plus" size={24} color={colors.volt} />
          <Text style={[styles.resultName, styles.flex]}>Add “{typed}”</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

ExercisePicker.overlay = true;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingHorizontal: space.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  input: { flex: 1, minHeight: 50, color: colors.ink, fontFamily: fonts.body, fontSize: 17 },
  recents: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  recent: { minHeight: 44, maxWidth: '100%', paddingHorizontal: space.md, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  recentText: { fontFamily: fonts.label, fontSize: 15, color: colors.ink },
  prompt: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3, textAlign: 'center' },
  back: { width: 36, height: 52, alignItems: 'center', justifyContent: 'center' },
  backText: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
  swap: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  kit: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.line },
  resultPressed: { opacity: 0.7 },
  added: { opacity: 0.45 },
  resultName: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  resultBody: { fontFamily: fonts.body, fontSize: 13, color: colors.ink2 },
});
