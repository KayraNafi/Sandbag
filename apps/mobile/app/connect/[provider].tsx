import { INTEGRATIONS, isIntegrationId, type IntegrationId } from '@sandbag/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { api, errorText } from '@/api/client';
import { confirm } from '@/components/confirm';
import { initialSettings, settingsForm, statusLine } from '@/components/IntegrationSettings';
import { toast } from '@/components/Toast';
import { Button, Card, Field, Heading, Loading, Muted, Screen } from '@/components/ui';
import { syncNow } from '@/data/sync';
import { leave } from '@/nav';
import { colors } from '@/theme';

function Connect({ provider }: { provider: IntegrationId }) {
  const { name, keyUrl, keyHelp } = INTEGRATIONS[provider];
  const client = useQueryClient();
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.integrations });
  const view = integrations.data?.connected.find((item) => item.provider === provider);
  const [key, setKey] = useState('');
  const [settings, setSettings] = useState<unknown>(null);
  const [changing, setChanging] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ['integrations'] });

  const connect = useMutation({
    mutationFn: () => api.connectIntegration(provider, key.trim(), settings ?? initialSettings(provider, view?.settings)),
    onSuccess: () => {
      setKey('');
      setChanging(false);
      toast(`${name} connected.`);
      return refresh();
    },
    onError: (error) => toast(errorText(error)),
  });
  const disconnect = useMutation({
    mutationFn: (removeWorkouts: boolean) => api.disconnectIntegration(provider, removeWorkouts),
    onSuccess: async (_, removeWorkouts) => {
      await refresh();
      // Taking the sessions out changes History, which only sync brings to the phone.
      if (removeWorkouts) await syncNow();
      toast(`${name} disconnected.`);
      leave();
    },
    onError: (error) => toast(errorText(error)),
  });

  const askToRemove = async () => {
    if (await confirm(`Remove ${name}’s sessions too?`, `Every session that came from ${name} leaves your History and the rankings. Ones you logged here stay.`, 'Remove them')) {
      disconnect.mutate(true);
    }
  };

  if (integrations.isPending) return <Loading />;
  const showForm = !view || changing;
  const current = settings ?? initialSettings(provider, view?.settings);

  return (
    <>
      {view ? (
        <Card style={view.status === 'bad_key' ? styles.trouble : undefined}>
          <Heading>{name}</Heading>
          <Muted>{statusLine(view)}</Muted>
        </Card>
      ) : null}
      {showForm ? (
        <Card>
          <Heading>{view ? 'New key or settings' : `Connect ${name}`}</Heading>
          <Muted>{keyHelp}</Muted>
          <Button title={`Open ${name}`} variant="ghost" onPress={() => void Linking.openURL(keyUrl)} />
          <Field label={`${name} API key`} secureTextEntry autoCapitalize="none" autoCorrect={false} value={key} onChangeText={setKey} />
          {settingsForm(provider, current, setSettings)}
          <Muted>Only the import service can read the key, and only to fetch your workouts.</Muted>
          <Button title={view ? 'Save' : 'Connect'} disabled={key.trim().length < 8} busy={connect.isPending} onPress={() => connect.mutate()} />
        </Card>
      ) : (
        <Button title="Change key or settings" variant="ghost" onPress={() => setChanging(true)} />
      )}
      {view ? (
        <>
          <Button title="Disconnect, keep its sessions" variant="ghost" busy={disconnect.isPending && !disconnect.variables} onPress={() => disconnect.mutate(false)} />
          <Button title="Disconnect and remove its sessions" variant="danger" busy={disconnect.isPending && disconnect.variables} onPress={() => void askToRemove()} />
        </>
      ) : null}
    </>
  );
}

export default function ConnectScreen() {
  const { provider } = useLocalSearchParams<{ provider: string }>();
  const known = provider && isIntegrationId(provider) ? provider : null;
  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: known ? INTEGRATIONS[known].name : 'Connect' }} />
      {known ? <Connect provider={known} /> : <Muted>Sandbag can’t import from that app.</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  trouble: { borderColor: colors.warnLine, backgroundColor: colors.warnBg },
});
