import { AVATARS, type AvatarId } from '@sandbag/shared';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';
import * as portraits from './portraits';

const INK = '#17180f';

interface Look {
  bg: string;
  skin: string;
  tank: string;
  extras: ReactNode;
}

/** Enormous shoulders, tiny head. Every character shares this build. */
function Bulk({ bg, skin, tank, extras }: Look) {
  return (
    <>
      <Circle cx={50} cy={50} r={50} fill={bg} />
      <Path d="M2 100C2 78 10 64 26 60C32 52 38 48 40 44H60C62 48 68 52 74 60C90 64 98 78 98 100Z" fill={skin} />
      <Circle cx={15} cy={78} r={13} fill={skin} stroke={INK} strokeWidth={1.5} />
      <Circle cx={85} cy={78} r={13} fill={skin} stroke={INK} strokeWidth={1.5} />
      <Path d="M30 100L33 64L40 60C42 67 58 67 60 60L67 64L70 100Z" fill={tank} />
      <Path d="M50 76V100M36 84C42 88 46 87 50 84C54 87 58 88 64 84" stroke={INK} strokeWidth={1.5} fill="none" opacity={0.45} />
      <Ellipse cx={50} cy={32} rx={14} ry={16} fill={skin} />
      {extras}
    </>
  );
}

const eyes = <G fill={INK}><Circle cx={44} cy={31} r={2} /><Circle cx={56} cy={31} r={2} /></G>;
const angry = <Path d="M40 26L47 29M60 26L53 29" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />;
const grin = <Path d="M43 38C46 43 54 43 57 38Z" fill="#fff" stroke={INK} strokeWidth={1.4} />;
const flat = <Path d="M45 39H55" stroke={INK} strokeWidth={2} strokeLinecap="round" />;
const smirk = <Path d="M44 39C48 40 53 40 57 36" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />;

const DRAWINGS: Record<AvatarId, ReactNode> = {
  flat_top: <Bulk bg="#3a5a8c" skin="#e3b58f" tank="#f4f6ec" extras={<>
    <Rect x={35} y={12} width={30} height={13} rx={2} fill={INK} />{eyes}{angry}{flat}
  </>} />,
  shades: <Bulk bg="#b0413e" skin="#8d5a3b" tank="#d4ff3a" extras={<>
    <Path d="M37 28H63V33C63 37 56 37 54 33H46C44 37 37 37 37 33Z" fill={INK} />{grin}
  </>} />,
  mohawk: <Bulk bg="#5b3a8c" skin="#f0c9a4" tank="#23262a" extras={<>
    <Path d="M44 18L42 3L47 9L50 1L53 9L58 3L56 18Z" fill="#ff5fa2" />{eyes}{angry}{smirk}
  </>} />,
  moustache: <Bulk bg="#c98a2b" skin="#d9a27a" tank="#b0413e" extras={<>
    <Path d="M36 26C38 12 62 12 64 26C58 20 42 20 36 26Z" fill="#3b2415" />{eyes}
    <Path d="M38 38C44 32 48 34 50 36C52 34 56 32 62 38C56 40 52 39 50 38C48 39 44 40 38 38Z" fill="#3b2415" />
  </>} />,
  bun: <Bulk bg="#2f7d6b" skin="#c98d65" tank="#ff8a70" extras={<>
    <Circle cx={50} cy={10} r={7} fill="#2b1b12" /><Path d="M36 28C36 10 64 10 64 28C58 20 42 20 36 28Z" fill="#2b1b12" />{eyes}{angry}{grin}
  </>} />,
  beard: <Bulk bg="#44525e" skin="#e8bd98" tank="#3a5a8c" extras={<>
    <Path d="M36 30C36 52 64 52 64 30C62 37 56 36 50 36C44 36 38 37 36 30Z" fill="#7a3e1d" />{eyes}{angry}
    <Path d="M45 40H55" stroke="#f4f6ec" strokeWidth={2} strokeLinecap="round" />
  </>} />,
  headband: <Bulk bg="#1f6f9c" skin="#6f4429" tank="#f1d75e" extras={<>
    <Path d="M37 20C37 12 63 12 63 20Z" fill="#17120d" /><Rect x={36} y={20} width={28} height={6} fill="#ff5f4d" /><Path d="M64 22L74 18L72 26Z" fill="#ff5f4d" />{eyes}{grin}
  </>} />,
  curls: <Bulk bg="#8c3a6b" skin="#f2cfae" tank="#2f7d6b" extras={<>
    <G fill="#c2571f"><Circle cx={38} cy={21} r={6} /><Circle cx={45} cy={15} r={6} /><Circle cx={55} cy={15} r={6} /><Circle cx={62} cy={21} r={6} /><Circle cx={50} cy={12} r={6} /></G>{eyes}{smirk}
  </>} />,
  bull: <>
    <Circle cx={50} cy={50} r={50} fill="#a8432e" />
    <Path d="M2 100C2 74 18 60 34 58H66C82 60 98 74 98 100Z" fill="#4a2c1d" />
    <Path d="M33 22C22 22 14 16 14 5C20 12 28 12 37 14ZM67 22C78 22 86 16 86 5C80 12 72 12 63 14Z" fill="#f4f6ec" />
    <Path d="M32 18H68L64 50C62 60 38 60 36 50Z" fill="#5d3825" />
    <Ellipse cx={50} cy={50} rx={15} ry={10} fill="#d9a98a" /><Circle cx={45} cy={49} r={2} fill={INK} /><Circle cx={55} cy={49} r={2} fill={INK} />
    <Path d="M45 54C45 62 55 62 55 54" stroke="#f1d75e" strokeWidth={2.5} fill="none" />
    <G fill="#fff"><Circle cx={41} cy={30} r={4} /><Circle cx={59} cy={30} r={4} /></G>{<G fill={INK}><Circle cx={42} cy={31} r={2} /><Circle cx={58} cy={31} r={2} /></G>}
    <Path d="M35 24L45 27M65 24L55 27" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
  </>,
  gorilla: <>
    <Circle cx={50} cy={50} r={50} fill="#4f7d3a" />
    <Path d="M0 100C0 70 14 54 32 50H68C86 54 100 70 100 100Z" fill="#26272b" />
    <Ellipse cx={50} cy={32} rx={23} ry={25} fill="#26272b" />
    <Path d="M34 28C34 18 66 18 66 28C66 34 60 34 50 32C40 34 34 34 34 28ZM36 40C36 32 64 32 64 40C64 54 36 54 36 40Z" fill="#8a7d70" />
    <Circle cx={43} cy={27} r={2.5} fill={INK} /><Circle cx={57} cy={27} r={2.5} fill={INK} />
    <Path d="M47 36H53M41 44C46 48 54 48 59 44" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
    <Path d="M36 82C42 74 48 80 50 84C52 80 58 74 64 82" stroke="#44464d" strokeWidth={2.5} fill="none" />
  </>,
  potato: <>
    <Circle cx={50} cy={50} r={50} fill="#3f6c7a" />
    <Path d="M20 62C8 62 6 50 10 42C13 38 18 42 16 47C20 45 26 48 28 54ZM80 62C92 62 94 50 90 42C87 38 82 42 84 47C80 45 74 48 72 54Z" fill="#c4975c" stroke={INK} strokeWidth={1.5} />
    <Path d="M50 14C74 12 82 36 78 60C74 84 60 92 46 90C28 88 20 70 22 50C24 30 32 15 50 14Z" fill="#c4975c" stroke={INK} strokeWidth={1.5} />
    <G fill="#94703f"><Circle cx={36} cy={32} r={2} /><Circle cx={66} cy={70} r={2.5} /><Circle cx={34} cy={72} r={2} /><Circle cx={68} cy={34} r={1.5} /></G>
    <G fill="#fff"><Circle cx={42} cy={44} r={6} /><Circle cx={58} cy={44} r={6} /></G><Circle cx={43} cy={45} r={2.5} fill={INK} /><Circle cx={57} cy={45} r={2.5} fill={INK} />
    <Path d="M42 60C47 66 55 66 60 58" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />
  </>,
  sandbag: <>
    <Circle cx={50} cy={50} r={50} fill="#23262a" />
    <Path d="M22 66C10 68 6 54 11 46C14 42 19 46 17 51C21 49 27 52 29 58ZM78 66C90 68 94 54 89 46C86 42 81 46 83 51C79 49 73 52 71 58Z" fill="#e3b58f" stroke={INK} strokeWidth={1.5} />
    <Path d="M38 10C44 14 56 14 62 10C63 16 62 20 58 24H42C38 20 37 16 38 10Z" fill="#d4ff3a" />
    <Path d="M42 24C28 30 20 44 20 62C20 84 32 92 50 92C68 92 80 84 80 62C80 44 72 30 58 24Z" fill="#d4ff3a" />
    <Rect x={40} y={21} width={20} height={6} rx={3} fill={INK} />
    <Circle cx={42} cy={52} r={3} fill={INK} /><Circle cx={58} cy={52} r={3} fill={INK} />
    <Path d="M36 44L46 47M64 44L54 47" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
    <Path d="M43 66C47 62 53 62 57 66" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />
  </>,
  dumbbell: <>
    <Circle cx={50} cy={50} r={50} fill="#d4883a" />
    <Rect x={6} y={26} width={12} height={48} rx={3} fill="#1b1c20" /><Rect x={18} y={18} width={14} height={64} rx={3} fill="#2c2e34" />
    <Rect x={82} y={26} width={12} height={48} rx={3} fill="#1b1c20" /><Rect x={68} y={18} width={14} height={64} rx={3} fill="#2c2e34" />
    <Rect x={32} y={38} width={36} height={24} fill="#c8ccd2" />
    <Circle cx={43} cy={47} r={2.5} fill={INK} /><Circle cx={57} cy={47} r={2.5} fill={INK} />
    <Path d="M38 42L46 44M62 42L54 44" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <Path d="M44 55H56" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
  </>,
  frog: <Bulk bg="#d8c25a" skin="#5fa04a" tank="#b0413e" extras={<>
    <Ellipse cx={50} cy={34} rx={21} ry={13} fill="#5fa04a" />
    <G fill="#5fa04a"><Circle cx={38} cy={22} r={8} /><Circle cx={62} cy={22} r={8} /></G>
    <G fill="#fff"><Circle cx={38} cy={21} r={5.5} /><Circle cx={62} cy={21} r={5.5} /></G>
    <Circle cx={39} cy={22} r={2.5} fill={INK} /><Circle cx={61} cy={22} r={2.5} fill={INK} />
    <Path d="M34 37C42 44 58 44 66 37" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />
  </>} />,
  bahgat: portraits.bahgat,
  shakal: portraits.shakal,
};

export const AVATAR_NAMES: Record<AvatarId, string> = {
  flat_top: 'The Coach',
  shades: 'Mirror Selfie',
  mohawk: 'Pre-Workout',
  moustache: 'Since 1982',
  bun: 'Spot Me',
  beard: 'One More Set',
  headband: 'Cardio Liar',
  curls: 'Curl Bar Hog',
  bull: 'Full Send',
  gorilla: 'Rest Day? No',
  potato: 'Couch Potato',
  sandbag: 'The Sandbag',
  dumbbell: 'Dumb Bell',
  frog: 'Skips Nothing',
  bahgat: 'Bahgat Saber',
  shakal: 'Adel Shakal',
};

export const AVATAR_IDS = AVATARS;

export function AvatarArt({ id, size }: { id: AvatarId; size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 100 100">{DRAWINGS[id]}</Svg>;
}

/** Null only while the profile hasn't loaded on a first offline launch. */
export function Avatar({ user, size = 40 }: { user: { displayName: string; avatar: AvatarId } | null; size?: number }) {
  return (
    <View
      accessibilityLabel={user ? `${user.displayName}’s character` : undefined}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.surface2 }}
    >
      {user?.avatar && DRAWINGS[user.avatar] ? <AvatarArt id={user.avatar} size={size} /> : null}
    </View>
  );
}
