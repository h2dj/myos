import {
  Bell,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Search,
  Settings,
  Share2,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 화면 설명 (페이지 헤더 보조 문구) */
  description: string;
  /** 개발계획상 기능이 구현되는 단계. 'v1.1'은 MVP 이후 */
  phase: 1 | 2 | 3 | 4 | 'v1.1';
}

export const MAIN_NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: '대시보드',
    icon: LayoutDashboard,
    description: '오늘과 이번 주 현황을 한 화면에서 확인합니다.',
    phase: 2,
  },
  {
    href: '/inbox',
    label: '인박스',
    icon: Inbox,
    description: '떠오른 메모·할 일·링크를 빠르게 모으고 분류합니다.',
    phase: 1,
  },
  {
    href: '/tasks',
    label: '할 일',
    icon: CheckSquare,
    description: '상태·우선순위·마감·반복으로 할 일을 관리합니다.',
    phase: 1,
  },
  {
    href: '/calendar',
    label: '캘린더',
    icon: CalendarDays,
    description: '내 일정과 Google Calendar 일정을 함께 봅니다.',
    phase: 4,
  },
  {
    href: '/knowledge',
    label: '지식 / 아이디어',
    icon: Lightbulb,
    description: '노트·아이디어·자료를 태그와 프로젝트로 연결합니다.',
    phase: 1,
  },
  {
    href: '/activities',
    label: '사업·활동 / 활동처',
    icon: FolderKanban,
    description: '기한 없는 상시 사업·활동과 활동처를 관리합니다.',
    phase: 1,
  },
  {
    href: '/projects',
    label: '프로젝트',
    icon: FolderKanban,
    description: '프로젝트 진행 현황과 관련 할 일을 관리합니다.',
    phase: 1,
  },
  {
    href: '/finance',
    label: '재정 관리',
    icon: Wallet,
    description: '수입·지출·자산·예산을 관리합니다.',
    phase: 'v1.1',
  },
  {
    href: '/automations',
    label: '자동화',
    icon: Zap,
    description: '반복 관리 규칙을 설정하고 실행 이력을 확인합니다.',
    phase: 3,
  },
  {
    href: '/sharing',
    label: '공유',
    icon: Share2,
    description: '공유 공간과 멤버 권한을 관리합니다.',
    phase: 4,
  },
];

export const UTILITY_NAV: NavItem[] = [
  {
    href: '/search',
    label: '검색',
    icon: Search,
    description: '할 일·프로젝트·상시 활동·노트를 검색합니다.',
    phase: 4,
  },
  {
    href: '/notifications',
    label: '알림',
    icon: Bell,
    description: '앱 내 알림을 확인하고 읽음 처리합니다.',
    phase: 1,
  },
  {
    href: '/settings',
    label: '설정',
    icon: Settings,
    description: '계정·알림·연동·데이터를 관리합니다.',
    phase: 1,
  },
];

export const ALL_NAV = [...MAIN_NAV, ...UTILITY_NAV];

export function findNavItem(href: string): NavItem {
  const item = ALL_NAV.find((n) => n.href === href);
  if (!item) throw new Error(`알 수 없는 메뉴: ${href}`);
  return item;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function phaseLabel(phase: NavItem['phase']): string {
  return phase === 'v1.1' ? 'v1.1에서 제공 예정' : `${phase}단계에서 구현 예정`;
}
