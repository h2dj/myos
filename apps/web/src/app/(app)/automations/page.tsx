import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/placeholder-page';
import { findNavItem } from '@/lib/navigation';

const HREF = '/automations';

export const metadata: Metadata = { title: findNavItem(HREF).label };

export default function Page() {
  return <PlaceholderPage href={HREF} />;
}
