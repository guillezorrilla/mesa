import { useCommand } from '../lib/useCommand';

/** Every mesa command, from the same reference `mesa help --agent` prints for agents. */
export function HelpScreen() {
  const { data: commands } = useCommand('help.reference');
  return (
    <section data-testid="help-screen">
      <h2>Help</h2>
      {commands?.map((c) => (
        <article key={c.name} data-testid="help-command">
          <h3>
            <code>{c.usage}</code>
          </h3>
          <p>{c.description}</p>
          {c.flags.length > 0 && (
            <ul>
              {c.flags.map((f) => (
                <li key={f.name}>
                  <code>
                    --{f.name}
                    {f.type === 'string' ? ' <string>' : ''}
                  </code>
                  {f.required ? ' (required)' : ''}: {f.description}
                </li>
              ))}
            </ul>
          )}
          <p>
            Example: <code data-testid="help-example">{c.example}</code>
          </p>
        </article>
      ))}
    </section>
  );
}
