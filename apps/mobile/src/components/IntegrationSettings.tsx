import { INTEGRATIONS, type IntegrationId, type IntegrationStatus, type IntegrationView, type LyftaUnit } from '@sandbag/shared';
import type { ReactNode } from 'react';
import { agoLong, plural } from '@/domain/format';
import { Muted, Segmented } from './ui';

type Form = { initial: unknown; render: (settings: unknown, onChange: (settings: unknown) => void) => ReactNode };

const UNITS: { key: LyftaUnit; label: string }[] = [{ key: 'kg', label: 'Kilograms' }, { key: 'lb', label: 'Pounds' }];

/** Each provider's own settings, asked when connecting. One per provider, or this won't build. */
const FORMS: Record<IntegrationId, Form> = {
  lyfta: {
    initial: { unit: 'kg' },
    render: (settings, onChange) => (
      <>
        <Segmented options={UNITS} value={(settings as { unit: LyftaUnit }).unit} onChange={(unit) => onChange({ unit })} />
        <Muted>Whatever Lyfta shows your weights in. Pounds are turned into kilograms as they come in.</Muted>
      </>
    ),
  },
};

export const initialSettings = (provider: IntegrationId, current?: unknown) => current ?? FORMS[provider].initial;
export const settingsForm = (provider: IntegrationId, settings: unknown, onChange: (settings: unknown) => void) => FORMS[provider].render(settings, onChange);

const STATUS: Record<IntegrationStatus, (name: string) => string> = {
  connecting: () => 'Connected. The first import comes in within a few minutes.',
  ok: () => 'Connected.',
  bad_key: (name) => `${name} turned the key down. Paste a fresh one to start again.`,
  failing: (name) => `Couldn’t reach ${name} lately. It keeps trying.`,
};

/** One line on how an app's imports are going. */
export function statusLine(view: IntegrationView): string {
  const { name } = INTEGRATIONS[view.provider];
  const counted = view.imported ? ` ${plural(view.imported, 'session')} brought in` : '';
  const synced = view.syncedAt ? `, last checked ${agoLong(view.syncedAt)}.` : counted ? '.' : '';
  return `${STATUS[view.status](name)}${counted}${synced}`;
}
