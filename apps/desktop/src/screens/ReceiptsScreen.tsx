import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCommand } from '@/lib/useCommand';

/** The newest receipts: the audit trail of what Mesa did, newest first. */
export function ReceiptsScreen() {
  const { data: receipts } = useCommand('receipts.list');
  return (
    <section data-testid="receipts-screen" className="space-y-4">
      <PageHeader
        title="Receipts"
        description="What Mesa did, newest first: the vault's audit trail."
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts?.map((e) => (
              <TableRow key={e.receipt.id} data-testid="receipt-row" data-status={e.receipt.status}>
                <TableCell className="font-mono text-xs">{e.receipt.started}</TableCell>
                <TableCell>{e.receipt.type}</TableCell>
                <TableCell>
                  <Badge variant={e.receipt.status === 'ok' ? 'secondary' : 'destructive'}>
                    {e.receipt.status}
                  </Badge>
                </TableCell>
                <TableCell>{e.summary}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
