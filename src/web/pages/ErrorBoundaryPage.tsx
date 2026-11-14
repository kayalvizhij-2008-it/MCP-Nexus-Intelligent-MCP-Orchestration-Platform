import { AlertTriangle, RefreshCw } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.js';
import { Button, EmptyState, Panel } from '../components/ui.js';

export function ErrorBoundaryPage({ message, onReset }: { message?: string; onReset?: () => void }) {
  return (
    <div className="fade-in">
      <PageHeader title="Something went wrong" subtitle="An unexpected error occurred while rendering this page." />
      <Panel>
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title="Render error"
          description={message || 'The application hit an unexpected state. You can retry or return to the dashboard.'}
          action={
            <div className="flex items-center gap-2">
              {onReset && (
                <Button variant="primary" size="sm" onClick={onReset}>
                  <RefreshCw size={12} /> Retry
                </Button>
              )}
              <Link to="/" className="btn btn-ghost btn-sm">
                Dashboard
              </Link>
            </div>
          }
        />
      </Panel>
    </div>
  );
}
