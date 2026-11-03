import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarArt } from '@/components/Avatar';
import { BodyMap } from '@/components/BodyMap';
import { Logo } from '@/components/Logo';
import { Burst, FadeIn, feel, Pop, Stamp } from '@/components/motion';
import { Button } from '@/components/ui';
import { useData } from '@/data/store';
import { colors, fonts, space } from '@/theme';

const TRY_SETS = 3;

/** Have a go, on the same screen they'll really use. Reading about logging a set is worse than logging one. */
function LogPicture() {
  const [done, setDone] = useState(0);
  const finished = done >= TRY_SETS;
  return (
    <View style={styles.picture}>
      <View style={styles.pips}>
        {Array.from({ length: TRY_SETS }, (_, set) => (
          <Pop key={`${set}-${set < done}`} style={[styles.pip, set < done && styles.pipDone, set === done && styles.pipOn]}>
            <Text style={[styles.pipText, set < done && styles.pipTextDone]}>{set + 1}</Text>
          </Pop>
        ))}
      </View>
      <Text style={styles.tryNumbers}>60 KG × 8</Text>
      <Button
        title={finished ? 'Logged' : `Set ${done + 1} done`}
        variant="ghost"
        disabled={finished}
        onPress={() => {
          if (done + 1 >= TRY_SETS) feel.win();
          else feel.tick();
          setDone(done + 1);
        }}
      />
      <Burst fire={done} big={finished} />
      <Text style={styles.tryIt}>{finished ? 'THAT’S IT. THAT’S LOGGING.' : 'GO ON, TRY IT'}</Text>
    </View>
  );
}

function CallPicture() {
  const [called, setCalled] = useState(false);
  return (
    <View style={styles.picture}>
      <View style={styles.faces}>
        <AvatarArt id="bull" size={84} />
        <AvatarArt id="frog" size={84} />
      </View>
      {called
        ? <Stamp style={styles.stamp}><Text style={styles.stampText}>SANDBAG</Text></Stamp>
        : <Button title="Call it" variant="ghost" style={styles.callIt} onPress={() => { feel.warn(); setCalled(true); }} />}
    </View>
  );
}

const CARDS = [
  { title: 'Log it', body: 'Pick a workout. Your numbers are already there. Tap done after each set.', picture: <LogPicture /> },
  { title: 'Call it', body: 'See a lift that looks too easy? Call sandbag. They have two weeks to beat it, or they wear the badge.', picture: <CallPicture /> },
  { title: 'Win it', body: 'Beat your own numbers and show up. Each week you face someone new in your crew, and heavier friends get no head start.', picture: <BodyMap size={110} levels={{ chest: 1, back: 0.7, quads: 1, shoulders: 0.5, glutes: 0.8 }} /> },
];

/** Three cards, then lifting. The detail waits until the first time it matters. */
export default function Welcome() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [page, setPage] = useState(0);
  const pageWidth = Math.min(width, 640);
  const last = page === CARDS.length - 1;

  const finish = () => {
    feel.win();
    useData.getState().setSeenWelcome();
    router.replace('/');
  };

  return (
    <View style={[styles.host, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.top}>
        <Logo size={48} />
        <Pressable accessibilityRole="button" onPress={finish} hitSlop={8} style={styles.skip}><Text style={styles.skipText}>Skip</Text></Pressable>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(event.nativeEvent.contentOffset.x / pageWidth))}
        style={styles.pages}
      >
        {CARDS.map((card) => (
          <View key={card.title} style={[styles.page, { width: pageWidth }]}>
            <FadeIn style={styles.art}>{card.picture}</FadeIn>
            <Text accessibilityRole="header" style={styles.title}>{card.title.toUpperCase()}</Text>
            <Text style={styles.body}>{card.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.bottom}>
        <View style={styles.dots}>
          {CARDS.map((card, index) => <View key={card.title} style={[styles.dot, index <= page && styles.dotOn]} />)}
        </View>
        <Button title={last ? 'Let’s lift' : 'Next'} onPress={() => {
          if (last) finish();
          else {
            feel.tap();
            scroller.current?.scrollTo({ x: (page + 1) * pageWidth, animated: true });
            setPage(page + 1);
          }
        }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  top: { width: '100%', maxWidth: 640, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink2 },
  pages: { flex: 1, width: '100%', maxWidth: 640 },
  page: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center', gap: space.md },
  art: { minHeight: 260, justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 56, lineHeight: 68, color: colors.volt },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 26, color: colors.ink },
  bottom: { width: '100%', maxWidth: 640, paddingHorizontal: space.lg, gap: space.md },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { flex: 1, height: 8, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  dotOn: { backgroundColor: colors.volt },
  picture: { gap: space.sm },
  tryIt: { marginTop: space.xs, textAlign: 'center', fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.volt },
  callIt: { alignSelf: 'center', marginTop: space.md, minWidth: 180 },
  pips: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  pip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.surface2 },
  pipDone: { backgroundColor: colors.volt, borderColor: colors.volt },
  pipOn: { borderColor: colors.volt },
  pipText: { fontFamily: fonts.display, fontSize: 17, color: colors.ink2 },
  pipTextDone: { color: colors.voltInk },
  tryNumbers: { fontFamily: fonts.display, fontSize: 56, lineHeight: 62, color: colors.ink, textAlign: 'center' },
  faces: { flexDirection: 'row', justifyContent: 'center', gap: space.xl },
  stamp: { alignSelf: 'center', marginTop: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderWidth: 4, borderColor: colors.warn, borderRadius: 8 },
  stampText: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.warn },
});
