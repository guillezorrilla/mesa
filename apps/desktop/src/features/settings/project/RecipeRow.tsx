import { Sparkles } from 'lucide-react';
import { TextField } from '../controls/TextField';
import { SettingRow } from '../SettingRow';

/** An empty recipe leaves the override out, so the profile's applies. */
const recipe = (text: string) => ({ value: text.trim() || undefined });

/**
 * A git text recipe override (CONTEXT.md, Project override): what this project's `git-text` runs
 * are asked to write, each `{name}` filled by Mesa; empty, the profile's recipe applies.
 */
export function RecipeRow(props: {
  id: string;
  title: string;
  /** The `{name}`s Mesa fills in this recipe. */
  names: readonly string[];
  value: string | undefined;
  profile: string;
  onSave: (value: unknown) => void;
}) {
  return (
    <SettingRow
      icon={Sparkles}
      title={props.title}
      description={`Mesa fills ${props.names.map((name) => `{${name}}`).join(', ')}. Empty, the profile's recipe applies.`}
      keywords="project git recipe prompt ai agent generate"
      htmlFor={props.id}
    >
      <TextField
        id={props.id}
        multiline
        value={props.value ?? ''}
        placeholder={props.profile}
        parse={recipe}
        onSave={props.onSave}
      />
    </SettingRow>
  );
}
