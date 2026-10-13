export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error)
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  if (message)
    return (
      <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm">
        {message}
      </p>
    );
  return null;
}
