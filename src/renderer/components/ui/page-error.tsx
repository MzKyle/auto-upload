import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface PageErrorProps {
  message: string;
  actions?: ReactNode;
}

export function PageError({ message, actions }: PageErrorProps) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-destructive">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-destructive">操作不可用</div>
          <div className="mt-1 break-all text-sm text-destructive">
            {message}
          </div>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
