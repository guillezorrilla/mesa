import type { SavedPrompt } from '@mesa/core';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Selects literal saved text for insertion; the caller decides where it goes. */
export function SavedPromptPicker(props: {
  prompts?: readonly SavedPrompt[];
  onSelect: (text: string) => void;
}) {
  if (!props.prompts?.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Saved prompts
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {props.prompts.map((prompt) => (
          <DropdownMenuItem key={prompt.name} onSelect={() => props.onSelect(prompt.text)}>
            {prompt.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
