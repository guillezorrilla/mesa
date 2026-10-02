import { KnowledgeContext } from './KnowledgeContext';
import { VaultOverview } from './VaultOverview';

/** A project's Vault tab: its notes in the vault, and its decisions and vault changes. */
export function VaultTab(props: {
  project: string;
  onItem: (path: string) => void;
  onImport: () => void;
}) {
  return (
    <div className="space-y-8">
      <VaultOverview project={props.project} onItem={props.onItem} onImport={props.onImport} />
      <KnowledgeContext project={props.project} />
    </div>
  );
}
