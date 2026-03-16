import { IconName } from './types';

export type SidebarLink = {
  type: 'link';
  href: string;
  label: string;
  icon: IconName; // Tipado PRO
};

export type SidebarGroup = {
  type: 'group';
  label: string;
  icon: IconName; // Tipado PRO
  items: {
    href: string;
    label: string;
    icon: IconName;
  }[];
};

export type SidebarItem = SidebarLink | SidebarGroup;

export const SIDEBAR_STRUCTURE: SidebarItem[] = [
  { type: 'link', href: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { type: 'link', href: '/clients', label: 'Clientes', icon: 'Users' },
  { type: 'link', href: '/projects', label: 'Proyectos', icon: 'Briefcase' },
  { type: 'link', href: '/time-tracking', label: 'Time Tracking', icon: 'Clock' },

  {
    type: 'group',
    label: 'Ventas',
    icon: 'ShoppingBag',
    items: [
      { href: '/budgets', label: 'Presupuestos', icon: 'MessageSquare' },
      { href: '/proposals', label: 'Propuestas', icon: 'FileSignature' },
      { href: '/contracts', label: 'Contratos', icon: 'Book' },
    ],
  },

  {
    type: 'group',
    label: 'Finanzas',
    icon: 'DollarSign',
    items: [
      { href: '/invoices', label: 'Facturas', icon: 'FileText' },
      { href: '/expenses', label: 'Gastos', icon: 'BarChart2' },
      { href: '/tax-ledger', label: 'Libro Fiscal', icon: 'BookOpen' },
    ],
  },

  {
    type: 'group',
    label: 'Análisis y Reportes',
    icon: 'TrendingUp',
    items: [
      { href: '/reports', label: 'Resumen General', icon: 'TrendingUp' },
      { href: '/reports/profitability', label: 'Rentabilidad', icon: 'DollarSign' },
      { href: '/forecasting', label: 'Previsión', icon: 'Activity' },
    ],
  },

  {
    type: 'group',
    label: 'Marketplace',
    icon: 'Building',
    items: [
      { href: '/job-market', label: 'Buscar Proyectos', icon: 'Briefcase' },
      { href: '/saved-jobs', label: 'Ofertas Guardadas', icon: 'Star' },
      { href: '/my-applications', label: 'Mis Postulaciones', icon: 'Send' },
      { href: '/post-job', label: 'Publicar Oferta', icon: 'Plus' },
      { href: '/my-job-posts', label: 'Mis Ofertas', icon: 'Building' },
    ],
  },

  { type: 'link', href: '/ai-assistant', label: 'Asistente IA', icon: 'Sparkles' },

  {
    type: 'group',
    label: 'Equipo',
    icon: 'Users',
    items: [
      { href: '/team', label: 'Gestionar Equipo', icon: 'Users' },
      { href: '/roles', label: 'Roles y Permisos', icon: 'Shield' },
      { href: '/knowledge-base', label: 'Knowledge Base', icon: 'BrainCircuit' },
      { href: '/my-timesheet', label: 'Mi Hoja de Horas', icon: 'Clock' },
    ],
  },

  {
    type: 'group',
    label: 'Configuración',
    icon: 'Settings',
    items: [
      { href: '/settings', label: 'Ajustes Generales', icon: 'Settings' },
      { href: '/public-profile', label: 'Perfil Público', icon: 'User' },
      { href: '/billing', label: 'Facturación y Plan', icon: 'CreditCard' },
      { href: '/integrations', label: 'Integraciones', icon: 'Zap' },
      { href: '/affiliate', label: 'Afiliados', icon: 'Share2' },
    ],
  },
];