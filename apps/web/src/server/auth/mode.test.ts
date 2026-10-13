import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabasePublicConfig } from './mode';

describe('supabasePublicConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('publishable 키를 우선하고, 없으면 legacy anon 키를 쓴다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJ-legacy');
    expect(supabasePublicConfig()?.key).toBe('eyJ-legacy');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_abc');
    expect(supabasePublicConfig()?.key).toBe('sb_publishable_abc');
  });

  it('URL이나 키가 없으면 null', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_abc');
    expect(supabasePublicConfig()).toBeNull();
  });
});
