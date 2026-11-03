import { voice, type Entry, type Muscle } from '@sandbag/shared';
import { forwardRef, useRef, useState, type ComponentRef } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fitSize, formatDate, num } from '@/domain/format';
import { colors, fonts, space } from '@/theme';
import { BodyMap } from './BodyMap';
import { Icon } from './icons';
import { feel } from './motion';

export const CARD_LOOKS = ['photo', 'body', 'volt', 'receipt', 'sticker'] as const;
export type CardLook = (typeof CARD_LOOKS)[number];

/** Story shape, so a card goes straight into whatever people post to. */
const setWord = (sets: number) => `${sets} ${sets === 1 ? 'SET' : 'SETS'}`;
export const CARD_WIDTH = 288;
export const CARD_HEIGHT = 512;
export const PAPER = '#f2efe4';
export const PAPER_INK = '#14150f';
const SHOWN_LIFTS = 6;
const STICKER_SIZES = [0.8, 1, 1.25];
const STICKER_WIDTH = 190;
const STICKER_HEIGHT = 200;
const TAP_DISTANCE = 6;
const STICKER_MARGIN = space.md;

export interface CardData {
  title: string;
  date: string;
  /** Kilos moved, or 0 for a session with nothing to weigh. */
  moved: number;
  sets: number;
  minutes: number | null;
  entries: Entry[];
  bests: string[];
  load: Partial<Record<Muscle, number>>;
  /** Weeks running, when there's a streak worth printing. */
  streak: number;
}

const kilos = (value: number) => value.toLocaleString('en-US');
const topSet = (entry: Entry) => (entry.kind === 'time' ? `${num(entry.minutes ?? 0)} min` : entry.weight ? `${num(entry.weight)} × ${entry.reps ?? '–'}` : `${entry.sets ?? 1} × ${entry.reps ?? '–'}`);

function Stat({ value, label, ink, soft }: { value: string; label: string; ink: string; soft: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: ink }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: soft }]}>{label}</Text>
    </View>
  );
}

function Mark({ color }: { color: string }) {
  return <Text style={[styles.mark, { color }]}>SANDBAG</Text>;
}

/** The numbers on nothing at all, so they can sit on any photo. */
function StatSticker({ data }: { data: CardData }) {
  const facts = [data.sets ? setWord(data.sets) : null, data.minutes ? `${data.minutes} MIN` : null, data.streak > 1 ? `${data.streak} WEEKS` : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.sticker}>
      <View style={styles.stickerBody}><BodyMap size={58} margins={0} levels={data.load} /></View>
      <Text style={[styles.stickerMark, styles.shadow]}>SANDBAG</Text>
      <Text numberOfLines={1} style={[styles.stickerNumber, styles.shadow, { fontSize: fitSize(40, (data.moved ? `${kilos(data.moved)} KG` : setWord(data.sets)).length, STICKER_WIDTH) }]}>{data.moved ? `${kilos(data.moved)} KG` : setWord(data.sets)}</Text>
      <Text numberOfLines={1} style={[styles.stickerFacts, styles.shadow]}>{facts}</Text>
      {data.bests.length ? <Text numberOfLines={1} style={[styles.stickerBest, styles.shadow]}>NEW BEST: {data.bests[0]?.toUpperCase()}</Text> : null}
    </View>
  );
}

/** Drag it where the photo has room. Tap it to change its size. */
function MovableSticker({ data }: { data: CardData }) {
  const spot = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const resting = useRef({ x: 0, y: 0 });
  const [sizeAt, setSizeAt] = useState(1);
  const sizeRef = useRef(sizeAt);
  sizeRef.current = sizeAt;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => spot.setValue({ x: resting.current.x + gesture.dx, y: resting.current.y + gesture.dy }),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < TAP_DISTANCE && Math.abs(gesture.dy) < TAP_DISTANCE) {
        feel.tap();
        setSizeAt((sizeRef.current + 1) % STICKER_SIZES.length);
        spot.setValue(resting.current);
        return;
      }
      // Stays on the picture, wherever the thumb ended up.
      const scale = STICKER_SIZES[sizeRef.current] ?? 1;
      const roomX = Math.max(0, CARD_WIDTH - STICKER_MARGIN * 2 - STICKER_WIDTH * scale);
      const roomY = Math.max(0, CARD_HEIGHT - STICKER_MARGIN * 2 - STICKER_HEIGHT * scale);
      resting.current = {
        x: Math.max(0, Math.min(roomX, resting.current.x + gesture.dx)),
        y: Math.min(0, Math.max(-roomY, resting.current.y + gesture.dy)),
      };
      spot.setValue(resting.current);
    },
  })).current;
  return (
    <Animated.View
      {...pan.panHandlers}
      accessibilityLabel="Your numbers. Drag to move, tap to resize."
      style={[styles.stickerSpot, { transform: [...spot.getTranslateTransform(), { scale: STICKER_SIZES[sizeAt] ?? 1 }] }]}
    >
      <StatSticker data={data} />
    </Animated.View>
  );
}

/** Your photo with the session on it, which is the post people actually want to make. */
function PhotoLook({ data, photo, onPick }: { data: CardData; photo: string | null; onPick: () => void }) {
  return (
    <View style={[styles.card, styles.photoCard]}>
      {photo ? <Image source={{ uri: photo }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : (
        <Pressable accessibilityRole="button" accessibilityLabel="Add your photo" onPress={onPick} style={styles.photoEmpty}>
          <Icon name="plus" size={48} color={colors.volt} />
          <Text style={styles.photoEmptyText}>ADD YOUR PHOTO</Text>
        </Pressable>
      )}
      <MovableSticker data={data} />
    </View>
  );
}

/** The body is the route map of a lifting session: nobody else's day looks like this one. */
function BodyLook({ data }: { data: CardData }) {
  return (
    <View style={[styles.card, styles.bodyCard]}>
      <View style={styles.topRow}>
        <Mark color={colors.volt} />
        <Text style={styles.bodyDate}>{formatDate(data.date).toUpperCase()}</Text>
      </View>
      <Text numberOfLines={2} style={styles.bodyTitle}>{data.title.toUpperCase()}</Text>
      <View style={styles.bodyArt}><BodyMap size={118} margins={0} levels={data.load} /></View>
      {data.bests.length ? <Text numberOfLines={1} style={styles.bodyBest}>NEW BEST: {data.bests.join(', ').toUpperCase()}</Text> : null}
      <View style={styles.stats}>
        {data.moved ? <Stat value={kilos(data.moved)} label="KG MOVED" ink={colors.ink} soft={colors.ink3} /> : null}
        {data.sets ? <Stat value={String(data.sets)} label={data.sets === 1 ? 'SET' : 'SETS'} ink={colors.ink} soft={colors.ink3} /> : null}
        {data.minutes ? <Stat value={String(data.minutes)} label="MIN" ink={colors.ink} soft={colors.ink3} /> : null}
        {data.streak > 1 ? <Stat value={String(data.streak)} label="WEEKS" ink={colors.ink} soft={colors.ink3} /> : null}
      </View>
    </View>
  );
}

/** All type, all volt. The number is the picture. */
function VoltLook({ data }: { data: CardData }) {
  const shown = data.entries.slice(0, SHOWN_LIFTS);
  return (
    <View style={[styles.card, styles.voltCard]}>
      <View style={styles.topRow}>
        <Mark color={colors.voltInk} />
        <Text style={styles.voltSmall}>{formatDate(data.date).toUpperCase()}</Text>
      </View>
      <View style={styles.voltMiddle}>
        <Text numberOfLines={1} style={[styles.voltNumber, { fontSize: fitSize(72, String(data.moved ? kilos(data.moved) : data.sets).length, CARD_WIDTH - space.lg * 2) }]}>{data.moved ? kilos(data.moved) : data.sets}</Text>
        <Text style={styles.voltUnit}>{data.moved ? 'KG MOVED' : data.sets === 1 ? 'SET DONE' : 'SETS DONE'}</Text>
        {data.moved ? <Text style={styles.voltLine}>{voice.lifted(data.moved)}</Text> : null}
      </View>
      <View style={styles.voltLifts}>
        <Text numberOfLines={1} style={styles.voltTitle}>{data.title.toUpperCase()}</Text>
        {shown.map((entry) => (
          <View key={entry.id} style={styles.voltLift}>
            <Text numberOfLines={1} style={styles.voltLiftName}>{entry.name}</Text>
            <Text style={styles.voltLiftSet}>{topSet(entry)}</Text>
          </View>
        ))}
        {data.entries.length > SHOWN_LIFTS ? <Text style={styles.voltSmall}>AND {data.entries.length - SHOWN_LIFTS} MORE</Text> : null}
      </View>
    </View>
  );
}

function Barcode({ seed }: { seed: string }) {
  const bars = Array.from({ length: 34 }, (_, at) => ((seed.charCodeAt(at % seed.length) + at) % 3) + 1);
  return (
    <View style={styles.barcode}>
      {bars.map((width, at) => <View key={at} style={{ width, height: 30, marginRight: 1 + (at % 2), backgroundColor: PAPER_INK }} />)}
    </View>
  );
}

/** Proof of purchase. The joke only works because every number on it is true. */
function ReceiptLook({ data, seed }: { data: CardData; seed: string }) {
  const shown = data.entries.slice(0, SHOWN_LIFTS);
  const teeth = Array.from({ length: 19 }, (_, at) => `L${(at + 0.5) * 16} 10L${(at + 1) * 16} 0`).join('');
  return (
    <View style={styles.receiptHost}>
      <View style={styles.receipt}>
        <Text style={styles.receiptMark}>SANDBAG</Text>
        <Text style={styles.receiptSmall}>{formatDate(data.date).toUpperCase()}{data.minutes ? ` · ${data.minutes} MIN` : ''}</Text>
        <View style={styles.rule} />
        <Text numberOfLines={1} style={styles.receiptTitle}>{data.title.toUpperCase()}</Text>
        {shown.map((entry) => (
          <View key={entry.id} style={styles.receiptRow}>
            <Text numberOfLines={1} style={styles.receiptLift}>{entry.name.toUpperCase()}</Text>
            <Text style={styles.receiptSet}>{topSet(entry)}</Text>
          </View>
        ))}
        {data.entries.length > SHOWN_LIFTS ? <Text style={styles.receiptSmall}>AND {data.entries.length - SHOWN_LIFTS} MORE</Text> : null}
        <View style={styles.rule} />
        <View style={styles.receiptRow}>
          <Text style={styles.receiptLift}>SETS</Text>
          <Text style={styles.receiptSet}>{data.sets}</Text>
        </View>
        {data.bests.length ? (
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLift}>NEW BESTS</Text>
            <Text style={styles.receiptSet}>{data.bests.length}</Text>
          </View>
        ) : null}
        <View style={styles.receiptRow}>
          <Text style={styles.receiptLift}>EXCUSES</Text>
          <Text style={styles.receiptSet}>0</Text>
        </View>
        <View style={styles.receiptTotal}>
          <Text style={styles.receiptTotalLabel}>TOTAL</Text>
          <Text numberOfLines={1} style={[styles.receiptTotalValue, { fontSize: fitSize(28, (data.moved ? `${kilos(data.moved)} KG` : setWord(data.sets)).length, CARD_WIDTH - 110) }]}>{data.moved ? `${kilos(data.moved)} KG` : setWord(data.sets)}</Text>
        </View>
        <View style={styles.receiptEnd}>
          <Barcode seed={seed} />
          <Text style={styles.receiptSmall}>THANK YOU FOR NOT SANDBAGGING.</Text>
        </View>
      </View>
      <Svg width={CARD_WIDTH} height={10} viewBox={`0 0 ${CARD_WIDTH} 10`}>
        <Path d={`M0 0${teeth}Z`} fill={PAPER} />
      </Svg>
    </View>
  );
}

/** A session as something worth posting. Forwarded so the exact view can be saved as an image. */
export const SessionCard = forwardRef<ComponentRef<typeof View>, { look: CardLook; data: CardData; seed: string; photo?: string | null; onPickPhoto?: () => void }>(function SessionCard({ look, data, seed, photo = null, onPickPhoto }, ref) {
  return (
    <View ref={ref} collapsable={false} style={[styles.frame, look === 'sticker' ? styles.frameClear : styles.frameFilled]}>
      {look === 'photo' ? <PhotoLook data={data} photo={photo} onPick={() => onPickPhoto?.()} /> : null}
      {look === 'body' ? <BodyLook data={data} /> : null}
      {look === 'volt' ? <VoltLook data={data} /> : null}
      {look === 'receipt' ? <ReceiptLook data={data} seed={seed} /> : null}
      {look === 'sticker' ? <View style={styles.stickerAlone}><StatSticker data={data} /></View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: CARD_WIDTH, height: CARD_HEIGHT },
  frameFilled: { backgroundColor: colors.bg },
  frameClear: { backgroundColor: 'transparent' },
  card: { flex: 1, padding: space.lg, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mark: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24 },
  shadow: { textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },

  photoCard: { padding: 0, backgroundColor: colors.surface2 },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: space.sm, paddingTop: 96 },
  photoEmptyText: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.volt },
  sticker: { width: STICKER_WIDTH, gap: 0 },
  stickerBody: { alignSelf: 'flex-start', marginBottom: space.xs },
  stickerMark: { fontFamily: fonts.display, fontSize: 17, lineHeight: 22, color: colors.volt },
  stickerNumber: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: '#ffffff' },
  stickerFacts: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: '#ffffff' },
  stickerBest: { marginTop: 2, fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.volt },
  stickerSpot: { position: 'absolute', left: STICKER_MARGIN, bottom: STICKER_MARGIN, transformOrigin: 'left bottom' },
  stickerAlone: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bodyCard: { backgroundColor: colors.surface, gap: space.xs },
  bodyDate: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.ink3 },
  bodyTitle: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.ink },
  bodyArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bodyBest: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.volt },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  stat: { gap: 0 },
  statValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  statLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1 },

  voltCard: { backgroundColor: colors.volt },
  voltSmall: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.voltInk },
  voltMiddle: { flex: 1, justifyContent: 'center', gap: 2 },
  voltNumber: { fontFamily: fonts.display, fontSize: 72, lineHeight: 92, color: colors.voltInk, fontVariant: ['tabular-nums'] },
  voltUnit: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 2, color: colors.voltInk },
  voltLine: { marginTop: space.sm, fontFamily: fonts.bodyStrong, fontSize: 15, lineHeight: 20, color: colors.voltInk },
  voltLifts: { gap: 3, paddingTop: space.sm, borderTopWidth: 2, borderColor: colors.voltInk },
  voltTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.voltInk },
  voltLift: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  voltLiftName: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk },
  voltLiftSet: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk, fontVariant: ['tabular-nums'] },

  receiptHost: { flex: 1 },
  receipt: { flex: 1, gap: 5, padding: space.lg, backgroundColor: PAPER, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  receiptMark: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: PAPER_INK, textAlign: 'center' },
  receiptSmall: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: PAPER_INK, textAlign: 'center' },
  rule: { marginVertical: 5, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: PAPER_INK },
  receiptTitle: { fontFamily: fonts.label, fontSize: 17, letterSpacing: 1, color: PAPER_INK },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  receiptLift: { flex: 1, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.5, color: PAPER_INK },
  receiptSet: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.5, color: PAPER_INK, fontVariant: ['tabular-nums'] },
  receiptTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5, paddingTop: 7, borderTopWidth: 3, borderColor: PAPER_INK },
  receiptTotalLabel: { fontFamily: fonts.display, fontSize: 24, color: PAPER_INK },
  receiptTotalValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: PAPER_INK, fontVariant: ['tabular-nums'] },
  receiptEnd: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: space.xs },
  barcode: { flexDirection: 'row', alignItems: 'flex-end', height: 30 },
});
