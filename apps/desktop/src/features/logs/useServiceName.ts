import { useEffect, useState } from 'react';
import { useCall } from '@/lib/useCommand';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

/**
 * A service's name for its log file, the project's modules offered (the first by default), and
 * its file (`mesa logs file --path-only`, which also checks the name) once the name has settled.
 */
export function useServiceName(project: string) {
  const call = useCall();
  const [modules, setModules] = useState<string[]>();
  const [name, setName] = useState(project);
  useEffect(() => {
    void call('logs.modules', { project }).then((found) => {
      const list = found.ok ? found.data.modules : [];
      setModules(list);
      if (list[0]) setName(list[0]);
    });
  }, [call, project]);
  const typed = name.trim();
  const service = useDebouncedValue(typed, 300);
  const settled = modules !== undefined && Boolean(service) && service === typed;
  const [file, setFile] = useState<{ path?: string; source?: string; error?: string }>({});
  useEffect(() => {
    let gone = false;
    setFile({});
    // Once the modules are known and the name has settled, so a default or a keystroke is not asked for.
    if (!settled) return;
    void call('logs.file', { name: service, project, make: false }).then((result) => {
      if (!gone) setFile(result.ok ? result.data : { error: result.error.message });
    });
    return () => {
      gone = true;
    };
  }, [call, service, settled, project]);
  return {
    modules,
    name,
    setName,
    /** The settled name, once it names a file. */
    service: file.source ? service : undefined,
    file,
    /** Makes the file's folder, so the IDE or `mesa logs run` can write there. */
    makeFolder: () => void call('logs.file', { name: service, project }),
  };
}

export type ServiceName = ReturnType<typeof useServiceName>;
