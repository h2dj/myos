import { cloneElement, isValidElement, useId, type ComponentProps, type ReactElement } from 'react';

export const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20';

/** 라벨과 입력을 htmlFor/id로 연결한다 (선택 상자의 옵션 글자가 라벨 이름에 섞이지 않도록) */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generated = useId();
  const child = isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  const id = child?.props.id ?? generated;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {child ? cloneElement(child, { id }) : children}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}
