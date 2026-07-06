interface InlineFieldErrorProps {
  message?: string | null;
}

export function InlineFieldError({ message }: InlineFieldErrorProps) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}
