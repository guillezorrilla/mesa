import type { VaultHealth } from '@mesa/core';
import { ScanSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCall } from '@/lib/useCommand';

/** An explicit read-only check; the containing VaultContent remounts when its profile changes. */
export function VaultHealthPanel({ onSelect }: { onSelect: (path: string) => void }) {
  const call = useCall();
  const [report, setReport] = useState<VaultHealth>();
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const check = async () => {
    setChecking(true);
    setReport(undefined);
    setError(undefined);
    const result = await call('vault.health');
    if (!active.current) return;
    setChecking(false);
    if (result.ok) setReport(result.data);
    else setError(result.error.message);
  };
  return (
    <Card data-testid="vault-health-panel" className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Vault health</h3>
          <Muted>Check links and note metadata. Your files stay as they are.</Muted>
        </div>
        <Button
          data-testid="vault-health-check"
          variant="outline"
          disabled={checking}
          onClick={() => void check()}
        >
          <ScanSearch aria-hidden /> {checking ? 'Checking...' : 'Check health'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {report && (
        <>
          <p role="status" className="text-sm">
            {report.findings.length === 0
              ? 'No findings'
              : `${report.findings.length} ${report.findings.length === 1 ? 'finding' : 'findings'}`}{' '}
            in {report.checked} checked Markdown files.
          </p>
          {report.findings.length > 0 && (
            <ul className="max-h-80 space-y-3 overflow-auto text-sm">
              {report.findings.map((finding) => (
                <li key={`${finding.path}:${finding.line}:${finding.column}:${finding.kind}`}>
                  <Button
                    data-testid="vault-health-path"
                    variant="link"
                    className="h-auto max-w-full justify-start whitespace-normal break-all p-0 font-mono text-xs"
                    onClick={() => onSelect(finding.path)}
                  >
                    {finding.path}
                    {finding.line ? `:${finding.line}` : ''}
                  </Button>
                  <p>{finding.message}</p>
                </li>
              ))}
            </ul>
          )}
          <details className="text-sm text-muted-foreground">
            <summary>What this checks</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {report.limitations.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </details>
          <Muted>Results reflect the last check. Check again after editing notes.</Muted>
        </>
      )}
    </Card>
  );
}
