import type { Check, DoctorReport } from '@mesa/core';
import { Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOpenSettings } from '@/features/settings/useOpenSettings';
import { cn } from '@/lib/utils';
import { InstallButton } from './InstallButton';

const MARK: Record<Check['status'], string> = { ok: '✓', warn: '!', fail: '✗' };
const TONE: Record<Check['status'], string> = {
  ok: 'text-state-idle',
  warn: 'text-state-waiting',
  fail: 'text-state-failed',
};

/**
 * A doctor report's checks, one row each, under its summary when it is not healthy. A missing
 * binary Mesa can install offers Install; `onInstalled` reruns the doctor. Decisions on rules
 * only offers Set up, which opens Settings on Smarter decisions.
 */
export function DoctorChecksPanel({
  report,
  onInstalled,
}: {
  report: DoctorReport | undefined;
  onInstalled: () => Promise<void>;
}) {
  const openSettings = useOpenSettings();
  return (
    <>
      {report && !report.healthy && (
        <Alert variant="destructive">
          <AlertDescription data-testid="doctor-summary">{report.summary}</AlertDescription>
        </Alert>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead>OK</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Hint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report?.checks.map((c) => (
              <TableRow key={c.name} data-testid="doctor-row" data-status={c.status}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell aria-label={c.status} className={cn('font-mono', TONE[c.status])}>
                  {MARK[c.status]}
                </TableCell>
                <TableCell className="font-mono text-xs">{c.version ?? ''}</TableCell>
                <TableCell className="space-y-2 whitespace-normal text-muted-foreground text-xs">
                  <p>{c.hint}</p>
                  {c.install && <InstallButton name={c.name} onInstalled={onInstalled} />}
                  {c.name === 'decisions' && c.version === 'rules' && openSettings && (
                    <Button size="sm" variant="secondary" onClick={() => openSettings('decisions')}>
                      <Sparkles aria-hidden /> Set up
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
