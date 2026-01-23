
// constants.ts

export const SIDEBAR_STRUCTURE = [
    // --- CORE ---
    { type: 'link', href: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
    { type: 'link', href: '/clients', label: 'Clientes', icon: 'Users' },
    { type: 'link', href: '/projects', label: 'Proyectos', icon: 'BriefcaseIcon' },
    { type: 'link', href: '/time-tracking', label: 'Time Tracking', icon: 'ClockIcon' },

    // --- SALES ---
    { type: 'group', label: 'Ventas', icon: 'ShoppingBag', items: [
        { href: '/budgets', label: 'Presupuestos', icon: 'MessageSquareIcon' },
        { href: '/proposals', label: 'Propuestas', icon: 'FileSignatureIcon' },
        { href: '/contracts', label: 'Contratos', icon: 'BookIcon' },
    ]},

    // --- FINANCE ---
    { type: 'group', label: 'Finanzas', icon: 'DollarSignIcon', items: [
        { href: '/invoices', label: 'Facturas', icon: 'FileTextIcon' },
        { href: '/expenses', label: 'Gastos', icon: 'BarChart2' },
        { href: '/tax-ledger', label: 'Libro Fiscal', icon: 'BookIcon' },
    ]},
    
    // --- REPORTS ---
    { type: 'group', label: 'Análisis y Reportes', icon: 'TrendingUpIcon', items: [
        { href: '/reports', label: 'Resumen General', icon: 'TrendingUpIcon' },
        { href: '/reports/profitability', label: 'Rentabilidad', icon: 'DollarSignIcon' },
        { href: '/forecasting', label: 'Previsión', icon: 'TrendingUpIcon' },
    ]},

    // --- MARKETPLACE ---
    { type: 'group', label: 'Marketplace', icon: 'Building', items: [
        { href: '/job-market', label: 'Buscar Proyectos', icon: 'BriefcaseIcon' },
        { href: '/saved-jobs', label: 'Ofertas Guardadas', icon: 'StarIcon' },
        { href: '/my-applications', label: 'Mis Postulaciones', icon: 'SendIcon' },
        { href: '/post-job', label: 'Publicar Oferta', icon: 'PlusIcon' },
        { href: '/my-job-posts', label: 'Mis Ofertas', icon: 'Building' },
    ]},
    
    // --- AI ---
    { type: 'link', href: '/ai-assistant', label: 'Asistente IA', icon: 'SparklesIcon' },

    // --- TEAM ---
    { type: 'group', label: 'Equipo', icon: 'Users', items: [
        { href: '/team', label: 'Gestionar Equipo', icon: 'Users' },
        { href: '/roles', label: 'Roles y Permisos', icon: 'ShieldIcon' },
        { href: '/knowledge-base', label: 'Knowledge Base', icon: 'BrainCircuitIcon' },
        { href: '/my-timesheet', label: 'Mi Hoja de Horas', icon: 'ClockIcon' },
    ]},
    
    // --- SETTINGS ---
    { type: 'group', label: 'Configuración', icon: 'SettingsIcon', items: [
        { href: '/settings', label: 'Ajustes Generales', icon: 'SettingsIcon' },
        { href: '/public-profile', label: 'Perfil Público', icon: 'UserIcon' },
        { href: '/billing', label: 'Facturación y Plan', icon: 'DollarSignIcon' },
        { href: '/integrations', label: 'Integraciones', icon: 'ZapIcon' },
        { href: '/affiliate', label: 'Afiliados', icon: 'Share2Icon' },
    ]},
];
