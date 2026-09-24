import { useCommand } from '../lib/useCommand';

/** The newest receipts: the audit trail of what Mesa did, newest first. */
export function ReceiptsScreen() {
  const { data: receipts } = useCommand('receipts.list');
  return (
    <section data-testid="receipts-screen">
      <h2>Receipts</h2>
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Type</th>
            <th>Status</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {receipts?.map((e) => (
            <tr key={e.receipt.id} data-testid="receipt-row" data-status={e.receipt.status}>
              <td>{e.receipt.started}</td>
              <td>{e.receipt.type}</td>
              <td>{e.receipt.status}</td>
              <td>{e.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
