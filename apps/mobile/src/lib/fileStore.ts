import { File, Paths } from 'expo-file-system';

/**
 * A value kept as JSON in a file in the app's documents: read once at launch (`empty` when there is
 * none), written on each change, with listeners for useSyncExternalStore.
 */
export function fileStore<T>(name: string, parse: (text: string) => T, empty: T) {
  const file = new File(Paths.document, name);
  let value = file.exists ? parse(file.textSync()) : empty;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const listener of listeners) listener();
      if (!file.exists) file.create();
      file.writeSync(JSON.stringify(next));
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
