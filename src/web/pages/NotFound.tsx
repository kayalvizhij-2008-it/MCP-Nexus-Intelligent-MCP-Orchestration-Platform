import { Compass } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.js';
import { Button, EmptyState, Panel } from '../components/ui.js';

export function NotFoundPage() {
  return (
    <div className="fade-in">
      <PageHeader eyebrow="404" title="Page not found" subtitle="The route you requested does not exist in this control plane." />
      <Panel>
        <EmptyState
          icon={<Compass size={20} />}
          title="404 — no such destination"
          description="Check the URL or use the command palette (Ctrl+K / Cmd+K) to navigate."
          action={
            <Link to="/" className="btn btn-primary btn-sm">
              Return to dashboard
            </Link>
          }
        />
      </Panel>
    </div>
  );
}
