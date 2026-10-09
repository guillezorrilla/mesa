import { useSyncExternalStore } from 'react';

const subscribe = (changed: () => void) => {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};
const dark = () => document.documentElement.dataset.theme === 'dark';

/** Whether the interface is dark now (useAppearance sets the root's `data-theme`), kept current. */
export const useInterfaceDark = () => useSyncExternalStore(subscribe, dark);
