import type { ComponentProps } from 'react';
import { Select } from '../ui/field';

export interface AreaOptions {
  projects: { id: string; name: string }[];
  tags: string[];
}

/** 영역 필터 값을 하나의 select 값으로 직렬화: '' | 'p:<id>' | 't:<name>' */
export function encodeArea(f: { projectId?: string; tag?: string }): string {
  if (f.projectId) return `p:${f.projectId}`;
  if (f.tag) return `t:${f.tag}`;
  return '';
}

export function decodeArea(v: string): { projectId?: string; tag?: string } {
  if (v.startsWith('p:')) return { projectId: v.slice(2) };
  if (v.startsWith('t:')) return { tag: v.slice(2) };
  return {};
}

export function AreaSelect({
  options,
  ...props
}: { options: AreaOptions } & ComponentProps<'select'>) {
  return (
    <Select {...props}>
      <option value="">전체 영역</option>
      {options.projects.length > 0 && (
        <optgroup label="프로젝트">
          {options.projects.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {options.tags.length > 0 && (
        <optgroup label="태그">
          {options.tags.map((t) => (
            <option key={t} value={`t:${t}`}>
              #{t}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
