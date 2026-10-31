import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { apiAddress, api, errorText } from '@/api/client';
import { confirm } from '@/components/confirm';
import { toast } from '@/components/Toast';
import { Button, Card, Field, Heading, Loading, Muted, Screen, Title } from '@/components/ui';
import { agoShort } from '@/domain/format';
import { colors, fonts } from '@/theme';

export default function ApiKeys() {
  const client = useQueryClient();
  const keys = useQuery({ queryKey: ['apiKeys'], queryFn: api.apiKeys });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ['apiKeys'] });

  const create = useMutation({
    mutationFn: () => api.createApiKey(name.trim(), password),
    onSuccess: (key) => {
      setCreated(key.key);
      setName('');
      setPassword('');
      return refresh();
    },
    onError: (error) => toast(errorText(error)),
  });
  const remove = useMutation({
    mutationFn: api.deleteApiKey,
    onSuccess: refresh,
    onError: (error) => toast(errorText(error)),
  });

  const copy = async () => {
    if (!created) return;
    await Clipboard.setStringAsync(created);
    toast('Copied.');
  };
  const askToDelete = async (id: string, keyName: string) => {
    if (await confirm(`Delete ${keyName}?`, 'Anything using this key stops working right away.', 'Delete')) remove.mutate(id);
  };

  return (
    <Screen padTop={false} onRefresh={() => keys.refetch()}>
      <Title>API keys</Title>
      <Muted>
        A key can read, add and delete your workouts, and nothing else. It can’t open your account, your crew or your password.
        Changing your password deletes every key.
      </Muted>
      <Muted selectable>Address: {apiAddress()}</Muted>
      {created ? (
        <Card style={styles.created}>
          <Heading>Copy it now</Heading>
          <Muted>You won’t see this key again, and neither will we. Only its fingerprint is stored.</Muted>
          <Text selectable style={styles.key}>{created}</Text>
          <Button title="Copy" onPress={copy} />
          <Button title="Done" variant="ghost" onPress={() => setCreated(null)} />
        </Card>
      ) : (
        <Card>
          <Heading>New key</Heading>
          <Field label="What’s it for?" maxLength={40} value={name} onChangeText={setName} />
          <Field label="Your password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} />
          <Button title="Create key" variant="ghost" disabled={!name.trim() || !password} busy={create.isPending} onPress={() => create.mutate()} />
        </Card>
      )}
      {keys.isPending ? <Loading /> : null}
      {keys.isError ? <Muted>Can’t load your keys right now.</Muted> : null}
      {keys.data?.map((key) => (
        <Card key={key.id}>
          <Text style={styles.name}>{key.name}</Text>
          <Muted>{key.prefix}… {key.lastUsedAt ? `used ${agoShort(key.lastUsedAt)}` : 'never used'}</Muted>
          <Button title={`Delete ${key.name}`} variant="ghost" onPress={() => void askToDelete(key.id, key.name)} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  created: { borderColor: colors.volt },
  key: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
});
