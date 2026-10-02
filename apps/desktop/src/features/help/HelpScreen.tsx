import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommand } from '@/lib/useCommand';

/** Every mesa command, from the same reference `mesa help --agent` prints for agents. */
export function HelpScreen() {
  const { data: commands } = useCommand('help.reference');
  return (
    <section data-testid="help-screen" className="space-y-4">
      <PageHeader title="Help" description="Every mesa command, as agents read them too." />
      <div className="grid gap-3 lg:grid-cols-2">
        {commands?.map((c) => (
          <Card key={c.name} data-testid="help-command" className="gap-3">
            <CardHeader>
              <CardTitle>
                <h3 className="font-medium font-mono text-sm">
                  <code>{c.usage}</code>
                </h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{c.description}</p>
              {c.flags.length > 0 && (
                <ul className="space-y-0.5 text-xs">
                  {c.flags.map((f) => (
                    <li key={f.name}>
                      <code className="font-mono">--{f.name}</code> {f.type}
                      {f.required ? ', required' : ''}: {f.description}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs">
                Example:{' '}
                <code data-testid="help-example" className="rounded bg-muted px-1 py-0.5 font-mono">
                  {c.example}
                </code>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
