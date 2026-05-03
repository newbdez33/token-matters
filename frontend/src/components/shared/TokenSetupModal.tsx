import { useState, type FormEvent } from 'react';
import { Key } from 'lucide-react';
import { setCredentials } from '@/services/api';

interface TokenSetupModalProps {
  /** Optional message shown above the form (e.g. "Your token was rejected"). */
  message?: string;
  /** Callback after credentials are saved — usually triggers a re-fetch. */
  onSave: () => void;
}

/**
 * First-run / re-auth modal. Persists the user/token pair to
 * localStorage via `setCredentials()` so subsequent `fetch()`
 * calls in `services/api.ts` can attach them as `?user=&token=`.
 *
 * No accept/dismiss path — until creds are saved, the dashboard
 * has nothing to show, so blocking the UI is correct.
 */
export function TokenSetupModal({ message, onSave }: TokenSetupModalProps) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCredentials(email.trim(), token.trim());
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md border border-border bg-background p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-medium">Sign in</h2>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          This dashboard reads from the Token Beats backend. Enter your work
          email and the API token your admin gave you (typically shared via
          1Password).
        </p>

        {message && (
          <p className="text-sm text-destructive border border-destructive/40 px-3 py-2">
            {message}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="tb-user" className="block text-xs text-muted-foreground mb-1">
              Email
            </label>
            <input
              id="tb-user"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gcu.co.jp"
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </div>
          <div>
            <label htmlFor="tb-token" className="block text-xs text-muted-foreground mb-1">
              API token
            </label>
            <input
              id="tb-token"
              type="password"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="64-character hex string"
              className="w-full border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !email.trim() || !token.trim()}
            className="w-full border border-foreground bg-foreground text-background px-3 py-2 text-sm hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </form>

        <p className="text-xs text-muted-foreground">
          Don&apos;t have a token? Ask your admin (jacky@gcu.co.jp).
        </p>
      </div>
    </div>
  );
}
