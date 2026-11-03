import { trainedDates, weekStreak, type LoggedWorkout } from '@sandbag/shared';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/auth/session';
import { useData } from '@/data/store';
import { toIsoDate } from '@/domain/format';
import { activeLogged, goalsFor, medalsFor, sessionLoad, volumeOf, trustedEntries } from '@/domain/history';
import { colors, fonts, radius, space } from '@/theme';
import { Burst, feel, Pop } from './motion';
import { CARD_HEIGHT, CARD_LOOKS, CARD_WIDTH, SessionCard, type CardData } from './SessionCard';
import { shareImage } from './shareImage';
import { toast } from './Toast';
import { Button, Row } from './ui';

const CARD_GAP = 12;

/** Everything a card prints, from the session and what came before it. */
export function useCardData(workout: LoggedWorkout | undefined): CardData | null {
  const logged = useData((state) => state.logged);
  const me = useSession((state) => state.me);
  return useMemo(() => {
    if (!workout) return null;
    const all = activeLogged(logged);
    return {
      title: workout.title,
      date: workout.date,
      moved: volumeOf(workout),
      sets: trustedEntries(workout.entries).reduce((sum, entry) => sum + (entry.sets ?? 0), 0),
      minutes: workout.durationSeconds ? Math.max(1, Math.round(workout.durationSeconds / 60)) : null,
      entries: trustedEntries(workout.entries),
      bests: medalsFor(all, workout).filter((medal) => medal.place === 1).map((medal) => medal.entry.name),
      load: sessionLoad(workout),
      streak: weekStreak(trainedDates(all), goalsFor(me), toIsoDate(new Date()), me?.pausedWeeks).current,
    };
  }, [logged, me, workout]);
}

/** Swipe through the ways to show a session off, then save the one you like. */
export function SessionCards({ data, seed, primary, secondary }: { data: CardData; seed: string; primary?: ReactNode; secondary?: ReactNode }) {
  const cards = useRef<(ComponentRef<typeof View> | null)[]>([]);
  const [lookAt, setLookAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const look = CARD_LOOKS[lookAt];

  const pickPhoto = async () => {
    feel.tap();
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      const uri = picked.assets?.[0]?.uri;
      if (!picked.canceled && uri) setPhoto(uri);
    } catch {
      toast('Couldn’t open your photos.');
    }
  };
  const save = async () => {
    const view = cards.current[lookAt];
    if (!view) return;
    if (look === 'photo' && !photo) {
      await pickPhoto();
      return;
    }
    setSaving(true);
    try {
      await shareImage({ current: view }, `sandbag-${data.date}-${look}`);
      feel.win();
    } catch {
      toast('Couldn’t make the picture. A screenshot works just as well.');
    }
    setSaving(false);
  };

  return (
    <View style={styles.flex}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.flex}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          onScroll={(event) => setLookAt(Math.max(0, Math.min(CARD_LOOKS.length - 1, Math.round(event.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP)))))}
          scrollEventThrottle={32}
          contentContainerStyle={styles.cards}
          style={styles.scroller}
        >
          {CARD_LOOKS.map((name, place) => (
            <Pop key={name} delay={place * 90}>
              {/* The checks are only here on screen, to show the sticker has no background of its own. */}
              {/* Rounded out here only, so a saved picture fills the whole story with no dark corners. */}
              <View style={name === 'sticker' ? styles.clearBehind : name === 'receipt' ? undefined : styles.rounded}>
                <SessionCard
                  ref={(view) => { cards.current[place] = view; }}
                  look={name}
                  data={data}
                  seed={seed}
                  photo={photo}
                  onPickPhoto={() => void pickPhoto()}
                />
              </View>
            </Pop>
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {CARD_LOOKS.map((name, place) => <View key={name} style={[styles.dot, place === lookAt && styles.dotOn]} />)}
        </View>
        {look === 'photo' ? (
          <View style={styles.hintRow}>
            <Text style={styles.hint}>{photo ? 'Drag your numbers anywhere. Tap them to change size.' : 'Your photo stays on your phone until you post it.'}</Text>
            {photo ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void pickPhoto()}>
                <Text style={styles.hintLink}>Change</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {look === 'sticker' ? <Text style={styles.hintAlone}>See-through, so it goes on top of any photo or story.</Text> : null}
      </ScrollView>
      <View style={styles.actions}>
        {primary}
        <Row>
          <View style={styles.flex}><Button title={look === 'photo' && !photo ? 'Add a photo' : 'Save picture'} variant="ghost" busy={saving} onPress={() => void save()} /></View>
          {secondary ? <View style={styles.flex}>{secondary}</View> : null}
        </Row>
      </View>
      <Burst fire={1} big />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroller: { flexGrow: 0, marginHorizontal: -space.lg, marginTop: space.sm },
  cards: { gap: CARD_GAP, paddingHorizontal: space.lg, height: CARD_HEIGHT },
  rounded: { borderRadius: radius.lg, overflow: 'hidden' },
  clearBehind: { borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  dots: { flexDirection: 'row', alignSelf: 'center', gap: space.xs, marginTop: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface2 },
  dotOn: { backgroundColor: colors.volt },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.sm },
  hint: { flexShrink: 1, fontFamily: fonts.body, fontSize: 13, color: colors.ink3, textAlign: 'center' },
  hintLink: { fontFamily: fonts.bodyStrong, fontSize: 13, color: colors.volt },
  hintAlone: { marginTop: space.sm, fontFamily: fonts.body, fontSize: 13, color: colors.ink3, textAlign: 'center' },
  actions: { gap: space.sm, paddingTop: space.sm },
});
