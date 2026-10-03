import { parseSessionUri, repositoryUrl, UPDATE_LINK } from '@mesa/core/browser';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall } from '@/lib/useCommand';

/** The existing native dispatcher: startup links wait for this bridge's active profile. */
export function useMesaLinks(actions: {
  session: (id: string) => void;
  clone: (url: string) => void;
  profileChanged: () => void;
}): string | undefined {
  const { deepLinks } = usePlatform();
  const call = useCall();
  const latest = useRef(actions);
  const previous = useRef(call);
  useLayoutEffect(() => {
    latest.current = actions;
    if (previous.current !== call) {
      previous.current = call;
      actions.profileChanged();
    }
  });
  const [feedback, setFeedback] = useState<{ call: typeof call; text?: string }>();
  useEffect(() => {
    let active = true;
    let loading = true;
    let profile: string | undefined;
    let request = 0;
    const pending: string[] = [];
    const current = () => active && previous.current === call;
    const explain = (text?: string) => {
      if (current()) setFeedback({ call, text });
    };
    const open = async (urls: string[]) => {
      for (const url of urls) {
        // The update link is the updater's, in Rust (`mesa update install`).
        if (!current() || !url.startsWith('mesa:') || url === UPDATE_LINK) continue;
        const target = parseSessionUri(url);
        if (target && loading) {
          pending.push(url);
          continue;
        }
        const version = ++request;
        if (target) {
          if (!profile) {
            explain('Cannot read the active profile. Open the session from its profile.');
            continue;
          }
          if (target.profile !== undefined && target.profile !== profile) {
            explain(
              `This session link belongs to profile ${target.profile}. Open Mesa in that profile.`,
            );
            continue;
          }
          const result = await call('sessions.show', { id: target.id });
          if (!current() || version !== request) continue;
          if (result.ok && result.data.id === target.id) {
            explain();
            latest.current.session(target.id);
          } else explain(`Session ${target.id} is unavailable in the active profile.`);
        } else {
          try {
            repositoryUrl(url); // The clone owner's validation stays authoritative.
            explain();
            latest.current.clone(url);
          } catch {
            explain('Invalid Mesa link. Open the session or project from Mesa.');
          }
        }
      }
    };
    void call('profile.get').then((result) => {
      if (!current()) return;
      loading = false;
      profile = result.ok ? result.data.profile : undefined;
      void open(pending.splice(0));
    });
    let stop: (() => void) | undefined;
    void deepLinks
      .onOpen((urls) => void open(urls))
      .then((unlisten) => {
        if (!current()) {
          unlisten();
          return;
        }
        stop = unlisten;
        void deepLinks.current().then((urls) => {
          if (urls) void open(urls);
        });
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [deepLinks, call]);
  return feedback?.call === call ? feedback.text : undefined;
}
