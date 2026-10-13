export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-6 text-accent" aria-hidden>
        <path d="M12 2 17 7 12 12 7 7Z" fill="currentColor" opacity="0.9" />
        <path d="M7 7 12 12 7 17 2 12Z" fill="currentColor" opacity="0.6" />
        <path d="M17 7 22 12 17 17 12 12Z" fill="currentColor" opacity="0.75" />
        <path d="M12 12 17 17 12 22 7 17Z" fill="currentColor" opacity="0.45" />
      </svg>
      MyOS
    </span>
  );
}
