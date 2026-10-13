import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyOS',
    short_name: 'MyOS',
    description: '개인 통합 관리 시스템',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f7f8fa',
    theme_color: '#111827',
    lang: 'ko',
  };
}
