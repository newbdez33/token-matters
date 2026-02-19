import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="border border-dashed p-6 text-center">
      <AlertCircle className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-foreground underline underline-offset-4 hover:text-muted-foreground"
        >
          Retry
        </button>
      )}
    </div>
  );
}
