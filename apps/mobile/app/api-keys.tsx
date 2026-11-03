import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { apiAddress, api, errorText } from '@/api/client';
import { confirm } from '@/components/confirm';
import { Icon, type IconName } from '@/components/icons';
import { Burst, FadeIn, feel, Pop, Stamp } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Toast';
import { Button, Field, Heading, Loading, Muted, Screen, Segments, Title } from '@/components/ui';
import { agoShort } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';

const TEETH = 6;

/** Each key gets its own cut, worked out from the public part of it, so no two look alike. */
function KeyArt({ seed, color, width = 96 }: { seed: string; color: string; width?: number }) {
  const cuts = Array.from({ length: TEETH }, (_, tooth) => (seed.charCodeAt(seed.length - 1 - tooth) || tooth + 3) % 4);
  return (
    <Svg width={width} height={width * 0.42} viewBox="0 0 120 50">
      <Path fillRule="evenodd" d="M22 3a20 20 0 1 1 0 40 20 20 0 0 1 0-40zm-7 20a7 7 0 1 0 14 0 7 7 0 0 0-14 0z" fill={color} />
      <Rect x="38" y="18" width="80" height="10" rx="2" fill={color} />
      {cuts.map((cut, tooth) => <Rect key={tooth} x={58 + tooth * 10} y="27" width="7" height={6 + cut * 5} rx="1" fill={color} />)}
    </Svg>
  );
}

/** A new key, shown the one time it ever will be. */
function FreshKey({ value, seed, onDone }: { value: string; seed: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(value);
    feel.tick();
    setCopied(true);
    toast('Copied.');
  };
  return (
    <View style={styles.fresh}>
      <Text style={styles.freshLabel}>COPY IT NOW</Text>
      <Pop><KeyArt seed={seed} color={colors.voltInk} width={170} /></Pop>
      <Pressable accessibilityRole="button" accessibilityLabel="Copy your new key" onPress={() => void copy()}>
        <Text selectable style={styles.freshKey}>{value}</Text>
        <Text style={styles.freshTap}>{copied ? 'COPIED' : 'TAP TO COPY'}</Text>
      </Pressable>
      <Text style={styles.freshNote}>You won’t see this key again, and neither will we. Only its fingerprint is stored.</Text>
      <Button title="Done" variant="ghost" style={styles.freshDone} onPress={onDone} />
      <Burst fire={1} big />
    </View>
  );
}

function Rule({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <View style={styles.rule}>
      <Icon name={icon} size={18} color={color} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const ASK = [
  { key: 'name', title: 'What’s it for?', hint: 'A script, a watch, a spreadsheet. You’ll want to know which one to delete later.' },
  { key: 'password', title: 'Your password', hint: 'A key can change your workouts, so we check it’s you.' },
] as const;

export default function ApiKeys() {
  const client = useQueryClient();
  const keys = useQuery({ queryKey: ['apiKeys'], queryFn: api.apiKeys });
  const [asking, setAsking] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<{ key: string; prefix: string } | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ['apiKeys'] });

  const close = () => {
    setAsking(false);
    setStep(0);
    setPassword('');
  };
  const create = useMutation({
    mutationFn: () => api.createApiKey(name.trim(), password),
    onSuccess: (key) => {
      feel.win();
      close();
      setName('');
      setCreated(key);
      return refresh();
    },
    onError: (error) => toast(errorText(error)),
  });
  const remove = useMutation({
    mutationFn: api.deleteApiKey,
    onSuccess: refresh,
    onError: (error) => toast(errorText(error)),
  });

  const askToDelete = async (id: string, keyName: string) => {
    if (await confirm(`Delete ${keyName}?`, 'Anything using this key stops working right away.', 'Delete')) remove.mutate(id);
  };
  const copyAddress = async () => {
    await Clipboard.setStringAsync(apiAddress());
    feel.tick();
    toast('Address copied.');
  };

  const data = keys.data;
  const ask = ASK[step]!;
  const ready = step === 0 ? Boolean(name.trim()) : Boolean(password);
  return (
    <Screen padTop={false} onRefresh={() => keys.refetch()}>
      <Title>API keys</Title>
      {created ? <FreshKey value={created.key} seed={created.prefix} onDone={() => setCreated(null)} /> : null}

      {keys.isPending ? <Loading /> : null}
      {keys.isError ? <Muted>Can’t load your keys right now.</Muted> : null}
      {data && !data.length && !created ? (
        <View style={styles.empty}>
          <KeyArt seed="sandbag" color={colors.surface2} width={190} />
          <Muted style={styles.emptyText}>No keys yet. For your own scripts and tools, when you want them.</Muted>
        </View>
      ) : null}
      {data?.length ? (
        <View style={styles.ring}>
          {data.map((key, index) => (
            <FadeIn key={key.id} delay={index * 60} style={styles.key}>
              <KeyArt seed={key.prefix} color={key.lastUsedAt ? colors.volt : colors.ink3} width={82} />
              <View style={styles.keyText}>
                <Text numberOfLines={1} style={styles.keyName}>{key.name}</Text>
                <Text numberOfLines={1} style={styles.keyUse}>{key.prefix}… {key.lastUsedAt ? `used ${agoShort(key.lastUsedAt)}` : 'never used'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${key.name}`} hitSlop={8} onPress={() => void askToDelete(key.id, key.name)} style={styles.keyDelete}>
                <Icon name="trash" size={20} color={colors.ink3} />
              </Pressable>
            </FadeIn>
          ))}
        </View>
      ) : null}
      <Button title="New key" variant={data?.length ? 'ghost' : 'primary'} onPress={() => { feel.tap(); setAsking(true); }} />

      <Heading section>What a key can do</Heading>
      <View style={styles.rules}>
        <Rule icon="check" color={colors.volt} text="Read, add and delete your workouts" />
        <Rule icon="close" color={colors.danger} text="Open your account" />
        <Rule icon="close" color={colors.danger} text="See your crew" />
        <Rule icon="close" color={colors.danger} text="Touch your password" />
      </View>
      <Muted>Changing your password deletes every key.</Muted>

      <Pressable accessibilityRole="button" accessibilityLabel={`Copy the address, ${apiAddress()}`} onPress={() => void copyAddress()} style={styles.address}>
        <View style={styles.keyText}>
          <Text style={styles.addressLabel}>ADDRESS</Text>
          <Text selectable style={styles.addressValue}>{apiAddress()}</Text>
        </View>
        <Icon name="share" size={20} color={colors.ink3} />
      </Pressable>

      <Sheet
        visible={asking}
        onClose={close}
        footer={(
          <Button
            title={step === 0 ? 'Next' : 'Create key'}
            disabled={!ready}
            busy={create.isPending}
            onPress={() => {
              if (step === 0) setStep(1);
              else create.mutate();
            }}
          />
        )}
      >
        <Segments total={ASK.length} done={step + 1} />
        <FadeIn key={ask.key} style={styles.ask}>
          <Stamp style={styles.askStamp}><Text style={styles.askTitle}>{ask.title.toUpperCase()}</Text></Stamp>
          <Muted>{ask.hint}</Muted>
          {step === 0
            ? <Field label="Name" maxLength={40} autoFocus value={name} onChangeText={setName} />
            : <Field label="Password" secureTextEntry autoComplete="current-password" autoFocus value={password} onChangeText={setPassword} />}
        </FadeIn>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fresh: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.volt, overflow: 'hidden' },
  freshLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.voltInk },
  freshKey: { fontFamily: fonts.bodyStrong, fontSize: 15, lineHeight: 21, color: colors.voltInk },
  freshTap: { marginTop: space.xs, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.voltInk, opacity: 0.6 },
  freshNote: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.voltInk },
  freshDone: { backgroundColor: colors.voltInk, borderColor: colors.voltInk },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  emptyText: { textAlign: 'center' },
  ring: { gap: space.xs },
  key: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 68, borderBottomWidth: 1, borderColor: colors.line },
  keyText: { flex: 1, gap: 2 },
  keyName: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  keyUse: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
  keyDelete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rules: { gap: space.sm },
  rule: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ruleText: { flex: 1, fontFamily: fonts.body, fontSize: 17, lineHeight: 22, color: colors.ink2 },
  address: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  addressLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.ink3 },
  addressValue: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  ask: { gap: space.md, marginTop: space.sm },
  // Tilts around its own middle, with room for the corners it swings out.
  askStamp: { alignSelf: 'flex-start', marginTop: space.sm, marginBottom: space.md },
  askTitle: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.volt },
});
