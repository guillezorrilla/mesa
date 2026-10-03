import { BookOpen, LifeBuoy, Tag } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCommand, useRun } from '@/lib/useCommand';
import { AttributionsPanel } from './AttributionsPanel';

/** Mesa's version and build, its links, and the licenses of the software it ships (`mesa about`). */
export function AboutScreen() {
  const { data: about, error } = useCommand('about');
  const run = useRun();
  const open = (url: string) => void run('browser.external', { url });
  return (
    <section data-testid="about-screen" className="max-w-3xl space-y-4">
      <PageHeader
        title="About Mesa"
        description="Its version, where to read more, and the software it ships."
      />
      {error && <Muted>{error.message}</Muted>}
      {about && (
        <>
          <Card>
            <CardContent className="space-y-3">
              <div>
                <p className="font-medium">
                  Version {about.version} (build {about.build})
                </p>
                <Muted>Mesa is open source under the {about.license} license.</Muted>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => open(about.links.docs)}>
                  <BookOpen aria-hidden /> Documentation
                </Button>
                <Button variant="outline" size="sm" onClick={() => open(about.links.support)}>
                  <LifeBuoy aria-hidden /> Support
                </Button>
                <Button variant="outline" size="sm" onClick={() => open(about.links.releases)}>
                  <Tag aria-hidden /> Releases
                </Button>
              </div>
            </CardContent>
          </Card>
          <AttributionsPanel attributions={about.attributions} note={about.note} />
        </>
      )}
    </section>
  );
}
