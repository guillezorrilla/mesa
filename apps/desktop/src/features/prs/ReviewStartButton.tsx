import { ChevronDown, Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Starts a review: Leave as drafts unless Post now is picked in its menu for this one start, so
 * posting is never sticky. While a review of the PR runs, it opens that session instead.
 */
export function ReviewStartButton(props: {
  label: 'Start review' | 'Re-review';
  /** The live review session of this PR, if one runs. */
  live?: string;
  /** Why Post now is off (only Claude review sessions may post); none when it is offered. */
  noPost?: string;
  onStart: (post: boolean) => void;
  onOpen: (session: string) => void;
}) {
  const [post, setPost] = useState(false);
  const { live } = props;
  if (live)
    return (
      <Button size="sm" data-testid="open-review" onClick={() => props.onOpen(live)}>
        Open review
      </Button>
    );
  return (
    <div className="flex">
      <Button
        size="sm"
        className="rounded-r-none"
        data-testid="start-review"
        onClick={() => props.onStart(post)}
      >
        <Play aria-hidden />
        {post ? `${props.label} and post` : props.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="rounded-l-none border-l border-l-primary-foreground/20 px-2"
            aria-label="How to deliver the review"
            data-testid="review-mode"
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Deliver the review</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            data-testid="review-mode-drafts"
            checked={!post}
            onCheckedChange={() => setPost(false)}
          >
            Leave as drafts
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            data-testid="review-mode-post"
            checked={post}
            disabled={Boolean(props.noPost)}
            onCheckedChange={() => setPost(true)}
          >
            Post now
          </DropdownMenuCheckboxItem>
          {props.noPost && (
            <p className="max-w-56 px-2 pb-1.5 text-muted-foreground text-xs">{props.noPost}</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
