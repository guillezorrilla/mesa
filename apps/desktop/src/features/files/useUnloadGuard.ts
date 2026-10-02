import { useEffect } from 'react';

/** While `dirty`, closing or reloading the window asks first. */
export function useUnloadGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [dirty]);
}
