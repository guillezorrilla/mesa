import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useSettings } from '../useSettings';

/** A select saved to `path` on change; `toValue` turns the option into the stored value. */
export function ChoiceField<T extends string>(props: {
  id: string;
  path: string;
  value: T;
  options: readonly (readonly [T, string])[];
  toValue?: (option: T) => unknown;
}) {
  const { acting, save } = useSettings();
  return (
    <NativeSelect
      id={props.id}
      className="min-w-40"
      value={props.value}
      disabled={acting}
      onChange={(event) => {
        const option = event.currentTarget.value as T;
        save(props.path, props.toValue ? props.toValue(option) : option);
      }}
    >
      {props.options.map(([value, text]) => (
        <NativeSelectOption key={value} value={value}>
          {text}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
