import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui.js';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="mono text-[11px] uppercase tracking-[0.2em] text-slate-600">404</div>
      <h1 className="text-[20px] font-semibold text-white">This route does not exist</h1>
      <p className="max-w-sm text-[12.5px] text-muted">
        The page you requested is not part of the control plane. Head back to the overview.
      </p>
      <Link to="/">
        <Button variant="primary" className="mt-1">
          Back to overview
        </Button>
      </Link>
    </div>
  );
}
