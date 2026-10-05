import type { SourceRow } from '@mesa/core';
import { Cable } from 'lucide-react';
import { warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { describeSource } from '@/lib/describeSource';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { useConnect } from '@/lib/useConnect';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';

/** The profile's Connections: one row per source, to connect, reconnect, or disconnect it. */
export function ConnectionSettings() {
  const list = useCommand('sources.list');
  const run = useRun();
  const { acting, act } = useAct();
  const { signingIn, connect: signIn } = useConnect();
  const connect = (source: SourceRow) =>
    void act(async () => {
      const result = await signIn(source.id);
      await list.refresh();
      return result && warningOf(result);
    });
  const disconnect = (source: SourceRow) =>
    void act(async () => {
      const result = await run('sources.disconnect', { source: source.id });
      await list.refresh();
      return result && warningOf(result);
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
          description={describeSource(source)}
          keywords="connect sign in oauth jira confluence notion"
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
