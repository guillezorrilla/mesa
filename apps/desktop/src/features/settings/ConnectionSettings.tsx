import type { SourceRow } from '@mesa/core';
import { Cable } from 'lucide-react';
import { useState } from 'react';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';

/** What a source's row says under its name. */
function described(source: SourceRow) {
  const sites = source.sites?.length
    ? `Sites: ${source.sites.map((site) => site.name).join(', ')}`
    : 'No sites';
  if (source.status === 'disconnected') return 'Not connected';
  if (source.status === 'needs-reconnect')
    return `Access was revoked or expired: reconnect to use it again. ${sites}`;
  return source.account ? `Signed in as ${source.account.name}. ${sites}` : sites;
}

/** The profile's Connections: one row per source, to connect, reconnect, or disconnect it. */
export function ConnectionSettings() {
  const list = useCommand('sources.list');
  const run = useRun();
  const { acting, act } = useAct();
  const [signingIn, setSigningIn] = useState(false);
  const connect = (source: SourceRow) =>
    void act(async () => {
      setSigningIn(true);
      const result = await run('sources.connect', { source: source.id });
      setSigningIn(false);
      await list.refresh();
      return result && said(`Connected ${source.label}`, result);
    });
  const disconnect = (source: SourceRow) =>
    void act(async () => {
      const result = await run('sources.disconnect', { source: source.id });
      await list.refresh();
      return result && said(`Disconnected ${source.label}`, result);
    });
  return (
    <SettingSection
      id="sources"
      title="Sources"
      description="Sign in to the tools whose pages and issues Mesa imports into a project's vault"
    >
      {(list.data?.sources ?? []).map((source) => (
        <SettingRow
          key={source.id}
          icon={Cable}
          title={source.label}
          description={described(source)}
          keywords="connect sign in oauth jira confluence"
          control={
            <span className="flex gap-2">
              {source.status !== 'connected' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={acting}
                  onClick={() => connect(source)}
                >
                  {signingIn
                    ? 'Waiting for sign-in...'
                    : source.connected
                      ? 'Reconnect'
                      : 'Connect'}
                </Button>
              )}
              {source.connected && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={acting}
                  onClick={() => disconnect(source)}
                >
                  Disconnect
                </Button>
              )}
            </span>
          }
        />
      ))}
    </SettingSection>
  );
}
