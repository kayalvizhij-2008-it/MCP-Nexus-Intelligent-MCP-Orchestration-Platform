import { Lock } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.js';
import { Button, EmptyState, Panel } from '../components/ui.js';

export function UnauthorizedPage() {
  return (
    <div className="fade-in">
      <PageHeader title="Unauthorized" subtitle="You do not have permission to view this resource." />
      <Panel>
        <EmptyState
          icon={<Lock size={20} />}
          title="Access denied"
          description="Your role does not include the permission required for this page. Contact an administrator if you believe this is an error."
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
