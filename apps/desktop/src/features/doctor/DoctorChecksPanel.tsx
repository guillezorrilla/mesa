import type { Check, DoctorReport } from '@mesa/core';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
 * binary Mesa can install offers Install; `onInstalled` reruns the doctor.
 */
export function DoctorChecksPanel({
  report,
  onInstalled,
}: {
  report: DoctorReport | undefined;
  onInstalled: () => Promise<void>;
}) {
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
                  {c.install && (
                    <InstallButton check={{ ...c, install: c.install }} onInstalled={onInstalled} />
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
