import { Client, Project, Task, Invoice, Expense, RecurringExpense, TimeEntry, Budget, Proposal, Contract, UserData, Referral, KnowledgeArticle, Job, JobApplication } from '../types';

const USER_ID = 'u-1';
const OTHER_USER_ID = 'u-2'; // For simulating other applicants

// --- Clientes ---
const clients: Client[] = [
    { id: 'c-1', user_id: USER_ID, name: 'InnovateCorp', company: 'InnovateCorp LLC', email: 'contact@innovatecorp.com', phone: '123-456-7890', created_at: '2024-10-01' }
];

// --- Proyectos ---
const projects: Project[] = [
    { id: 'p-1', user_id: USER_ID, name: 'Website Redesign', client_id: 'c-1', description: 'Complete redesign of the corporate website.', status: 'completed', start_date: '2024-10-05', due_date: '2024-10-20', budget_cents: 200000, created_at: '2024-10-05', category: 'Web Development', priority: 'High' }
];

// --- Tareas ---
const tasks: Task[] = [];

// --- Facturas ---
const invoices: Invoice[] = [
    {
        id: 'inv-1',
        user_id: USER_ID,
        invoice_number: 'INV-0001',
        client_id: 'c-1',
        project_id: 'p-1',
        issue_date: '2024-10-22',
        due_date: '2024-11-21',
        items: [
            { description: 'Diseño y Maquetación de Landing Page (HTML/CSS)', quantity: 1, price_cents: 50000 },
            { description: 'Desarrollo de Componentes Interactivos (JavaScript)', quantity: 1, price_cents: 40000 },
            { description: 'Configuración de Formulario de Contacto y Lógica de Envío', quantity: 1, price_cents: 15000 },
            { description: 'Optimización para Dispositivos Móviles (Responsive Design)', quantity: 1, price_cents: 15000 }
        ],
        subtotal_cents: 120000,
        tax_percent: 21,
        total_cents: 145200,
        paid: false,
        payment_date: null,
        created_at: '2024-10-22'
    }
];

// --- Gastos ---
const expenses: Expense[] = [];

// --- Gastos Recurrentes ---
const recurringExpenses: RecurringExpense[] = [];

// --- Registros de Tiempo ---
const timeEntries: TimeEntry[] = [];

// --- Knowledge Base Articles ---
const articles: KnowledgeArticle[] = [];

// --- Jobs and Applications ---
const jobs: Job[] = [
    {
        id: 'job-1',
        titulo: 'Desarrollador Full-Stack para E-commerce con Next.js',
        descripcionCorta: 'Buscamos un desarrollador experimentado para construir una tienda online moderna utilizando Next.js, Stripe y Vercel.',
        descripcionLarga: '## Sobre el Proyecto\n\nNecesitamos desarrollar desde cero una plataforma de e-commerce para una marca de moda sostenible. El objetivo es crear una experiencia de usuario fluida, rápida y visualmente atractiva.\n\n### Responsabilidades:\n- Desarrollar el frontend con Next.js y Tailwind CSS.\n- Implementar la lógica de backend (gestión de productos, usuarios, pedidos) usando serverless functions.\n- Integrar la pasarela de pago de Stripe.\n- Desplegar y mantener la aplicación en Vercel.\n\n### Requisitos:\n- 3+ años de experiencia con React y Node.js.\n- Experiencia demostrable con Next.js en producción.\n- Sólidos conocimientos de TypeScript.',
        presupuesto: 8000,
        duracionSemanas: 10,
        habilidades: ['Next.js', 'React', 'TypeScript', 'Node.js', 'Vercel', 'Stripe'],
        cliente: 'GreenFashion Co.',
        fechaPublicacion: 'Hace 2 días',
        isFeatured: true,
        compatibilidadIA: 92,
        postedByUserId: OTHER_USER_ID
    },
    {
        id: 'job-2',
        titulo: 'Backend Developer (Python/Django) para API de Análisis de Datos',
        descripcionCorta: 'Se requiere un desarrollador de backend para crear una API RESTful que procese y sirva grandes volúmenes de datos.',
        descripcionLarga: 'Estamos construyendo una plataforma de análisis de datos para el sector financiero. Tu rol será diseñar, desarrollar y mantener la API principal que alimentará nuestro dashboard. Buscamos a alguien con experiencia en optimización de consultas y manejo de bases de datos PostgreSQL.',
        presupuesto: 6500,
        duracionSemanas: 8,
        habilidades: ['Python (Django/Flask)', 'PostgreSQL', 'API REST', 'Docker'],
        cliente: 'DataInsights',
        fechaPublicacion: 'Hace 5 días',
        isFeatured: false,
        compatibilidadIA: 75,
        postedByUserId: OTHER_USER_ID
    },
    {
        id: 'job-3',
        titulo: 'Maquetador Web con Experiencia en Animaciones (Tailwind CSS)',
        descripcionCorta: 'Necesitamos un especialista en maquetación para convertir diseños de Figma en componentes de React animados e interactivos.',
        descripcionLarga: 'Nuestra agencia de diseño necesita un freelancer con un ojo increíble para el detalle. Trabajarás directamente con nuestros diseñadores para dar vida a interfaces complejas. El proyecto principal es un landing page interactivo para un evento tecnológico.',
        presupuesto: 3000,
        duracionSemanas: 4,
        habilidades: ['Tailwind CSS', 'React', 'Figma', 'Animaciones CSS'],
        cliente: 'PixelPerfect Agency',
        fechaPublicacion: 'Hace 1 semana',
        isFeatured: false,
        compatibilidadIA: 55,
        postedByUserId: OTHER_USER_ID
    },
];

const applications: JobApplication[] = [
    {
        id: 'app-1',
        jobId: 'job-1',
        userId: USER_ID,
        applicantName: 'Carlos Santana',
        jobTitle: 'Desarrollador Full-Stack para E-commerce con Next.js',
        proposalText: 'Hola GreenFashion Co.,\n\nHe revisado los detalles de vuestro proyecto de e-commerce y encaja perfectamente con mi experiencia. En los últimos dos años me he especializado en la creación de tiendas online de alto rendimiento con Next.js y he realizado varias integraciones con Stripe.\n\nMe encantaría discutir cómo mis habilidades pueden ayudar a construir una plataforma excepcional para vuestra marca.\n\nSaludos,\nCarlos',
        status: 'sent',
        appliedAt: '2024-10-23T10:00:00Z'
    }
];


const users: UserData[] = [];
const referrals: Referral[] = [];
const budgets: Budget[] = [];
const proposals: Proposal[] = [];
const contracts: Contract[] = [];

export const MOCK_DATA = {
    clients,
    projects,
    tasks,
    invoices,
    expenses,
    recurringExpenses,
    timeEntries,
    budgets,
    proposals,
    contracts,
    users,
    referrals,
    articles,
    jobs,
    applications,
    monthlyGoalCents: 0,
};