import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsNavItem<T extends string> {
  id: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface SettingsNavProps<T extends string> {
  items: Array<SettingsNavItem<T>>;
  activeId: T;
  onChange: (id: T) => void;
}

export function SettingsNav<T extends string>({
  items,
  activeId,
  onChange,
}: SettingsNavProps<T>) {
  return (
    <nav className="space-y-1 rounded-lg border bg-muted/20 p-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
            activeId === item.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-background hover:text-foreground",
          )}
        >
          {item.icon && <span className="mt-0.5 shrink-0">{item.icon}</span>}
          <span className="min-w-0">
            <span className="block font-medium">{item.label}</span>
            {item.description && (
              <span
                className={cn(
                  "mt-0.5 block text-xs",
                  activeId === item.id
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                {item.description}
              </span>
            )}
          </span>
        </button>
      ))}
    </nav>
  );
}
