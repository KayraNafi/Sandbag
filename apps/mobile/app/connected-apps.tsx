import { INTEGRATIONS } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api, errorText } from '@/api/client';
import { statusLine } from '@/components/IntegrationSettings';
import { ListGroup, ListRow, Loading, Muted, Screen, Title } from '@/components/ui';

/** The other apps this server can bring sessions in from, and how each one is going. */
export default function ConnectedApps() {
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.integrations });
  const { available = [], connected = [] } = integrations.data ?? {};

  return (
    <Screen padTop={false} onRefresh={() => integrations.refetch()}>
      <Title>Connected apps</Title>
      <Muted>Log somewhere else? Connect it and those sessions come in by themselves, and count like any other. Nothing goes back the other way.</Muted>
      {integrations.isPending ? <Loading /> : null}
      {integrations.isError ? <Muted>{errorText(integrations.error)}</Muted> : null}
      {integrations.isSuccess && !available.length ? <Muted>This server isn’t set up to import from other apps.</Muted> : null}
      {available.length ? (
        <ListGroup>
          {available.map((provider) => {
            const view = connected.find((item) => item.provider === provider);
            return (
              <ListRow
                key={provider}
                icon="link"
                title={INTEGRATIONS[provider].name}
                body={view ? statusLine(view) : 'Not connected'}
                onPress={() => router.push(`/connect/${provider}`)}
              />
            );
          })}
        </ListGroup>
      ) : null}
    </Screen>
  );
}
