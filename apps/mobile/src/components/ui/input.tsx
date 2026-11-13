import { Platform, TextInput } from 'react-native';
import { cn } from '@/lib/utils';

function Input({
  className,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex w-full min-w-0 flex-row items-center rounded-md border px-3 shadow-sm shadow-black/5',
        // A one-line field on iOS draws its text low and cuts descenders under text-base's line
        // height, so it gets a fixed height and a font size alone.
        props.multiline ? 'min-h-11 py-2.5 text-base' : 'h-11 py-0 text-[16px]',
        props.editable === false &&
          cn(
            'opacity-50',
            Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' }),
          ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          ),
        }),
        className,
      )}
      placeholderTextColorClassName="accent-muted-foreground"
      {...props}
    />
  );
}

export { Input };
