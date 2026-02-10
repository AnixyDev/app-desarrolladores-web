export type SidebarLink = {
  type: 'link';
  href: string;
  label: string;
  icon: string;
};

export type SidebarGroup = {
  type: 'group';
  label: string;
  icon: string;
  items: {
    href: string;
    label: string;
    icon: string;
  }[];
};

export type SidebarItem = SidebarLink | SidebarGroup;

export const SIDEBAR_STRUCTURE: SidebarItem[] = [
  { type: 'link', href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { type: 'link', href: '/clients', label: 'Clientes', icon: 'Users' },
  { type: 'link', href: '/projects', label: 'Proyectos', icon: 'BriefcaseIcon' },
  { type: 'link', href: '/time-tracking', label: 'Time Tracking', icon: 'ClockIcon' },

  {
    type: 'group',
    label: 'Ventas',
    icon: 'ShoppingBag',
    items: [
      { href: '/budgets', label: 'Presupuestos', icon: 'MessageSquareIcon' },
      { href: '/proposals', label: 'Propuestas', icon: 'FileSignatureIcon' },
      { href: '/contracts', label: 'Contratos', icon: 'BookIcon' },
    ],
  },

  {
    type: 'group',
    label: 'Finanzas',
    icon: 'DollarSignIcon',
    items: [
      { href: '/invoices', label: 'Facturas', icon: 'FileTextIcon' },
      { href: '/expenses', label: 'Gastos', icon: 'BarChart2' },
      { href: '/tax-ledger', label: 'Libro Fiscal', icon: 'BookIcon' },
    ],
  },

  {
    type: 'group',
    label: 'Análisis y Reportes',
    icon: 'TrendingUpIcon',
    items: [
      { href: '/reports', label: 'Resumen General', icon: 'TrendingUpIcon' },
      { href: '/reports/profitability', label: 'Rentabilidad', icon: 'DollarSignIcon' },
      { href: '/forecasting', label: 'Previsión', icon: 'TrendingUpIcon' },
    ],
  },

  {
    type: 'group',
    label: 'Marketplace',
    icon: 'Building',
    items: [
      { href: '/job-market', label: 'Buscar Proyectos', icon: 'BriefcaseIcon' },
      { href: '/saved-jobs', label: 'Ofertas Guardadas', icon: 'StarIcon' },
      { href: '/my-applications', label: 'Mis Postulaciones', icon: 'SendIcon' },
      { href: '/post-job', label: 'Publicar Oferta', icon: 'PlusIcon' },
      { href: '/my-job-posts', label: 'Mis Ofertas', icon: 'Building' },
    ],
  },

  { type: 'link', href: '/ai-assistant', label: 'Asistente IA', icon: 'SparklesIcon' },

  {
    type: 'group',
    label: 'Equipo',
    icon: 'Users',
    items: [
      { href: '/team', label: 'Gestionar Equipo', icon: 'Users' },
      { href: '/roles', label: 'Roles y Permisos', icon: 'ShieldIcon' },
      { href: '/knowledge-base', label: 'Knowledge Base', icon: 'BrainCircuitIcon' },
      { href: '/my-timesheet', label: 'Mi Hoja de Horas', icon: 'ClockIcon' },
    ],
  },

  {
    type: 'group',
    label: 'Configuración',
    icon: 'SettingsIcon',
    items: [
      { href: '/settings', label: 'Ajustes Generales', icon: 'SettingsIcon' },
      { href: '/public-profile', label: 'Perfil Público', icon: 'UserIcon' },
      { href: '/billing', label: 'Facturación y Plan', icon: 'DollarSignIcon' },
      { href: '/integrations', label: 'Integraciones', icon: 'ZapIcon' },
      { href: '/affiliate', label: 'Afiliados', icon: 'Share2Icon' },
    ],
  },
];