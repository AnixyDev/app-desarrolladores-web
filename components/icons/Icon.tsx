// components/icons/Icon.tsx
//
// IMPORTANTE: Este archivo NO usa "import * as Icons from 'lucide-react'".
// Ese patrón cargaba los ~600 íconos completos en el bundle principal.
// En su lugar usamos un mapa estático con solo los íconos que realmente
// se usan en la app. Para añadir un icono nuevo, agrégalo aquí.

import React from 'react';
import { LucideProps } from 'lucide-react';

import {
  // Navegación y layout
  LayoutDashboard,
  ChevronDown,
  ChevronUp,
  X,
  Menu,
  LogOut,
  // Entidades
  Users,
  Briefcase,
  Building,
  User,
  UserPlus,
  // Finanzas
  DollarSign,
  FileText,
  BarChart2,
  BookOpen,
  Book,
  CreditCard,
  // Ventas
  MessageSquare,
  FileSignature,
  // Tiempo
  Clock,
  // Análisis
  TrendingUp,
  Activity,
  // Marketplace
  ShoppingBag,
  Star,
  Send,
  Plus,
  // IA
  Sparkles,
  // Equipo
  Shield,
  BrainCircuit,
  GitBranch,
  // Configuración
  Settings,
  Share2,
  Zap,
  // Acciones
  Edit,
  Trash,
  Trash2,
  Download,
  Copy,
  Save,
  Search,
  Filter,
  Link,
  RefreshCw,
  Repeat,
  // Estado
  CheckCircle,
  XCircle,
  PlusCircle,
  AlertTriangle,
  // Comunicación
  Mail,
  Phone,
  Bell,
  Inbox,
  // Otros
  PenTool,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldCheck,
  ListTodo,
  Calendar,
  Pause,
  Play,
  Hash,
  Target,
  HelpCircle,
} from 'lucide-react';

// ── Mapa estático — solo los íconos que usa la app ────────────────────────────
// Añade aquí cualquier icono nuevo antes de usarlo con DynamicIcon.
const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  LayoutDashboard,
  ChevronDown,
  ChevronUp,
  X,
  Menu,
  LogOut,
  Users,
  Briefcase,
  Building,
  User,
  UserPlus,
  DollarSign,
  FileText,
  BarChart2,
  BookOpen,
  Book,
  CreditCard,
  MessageSquare,
  FileSignature,
  Clock,
  TrendingUp,
  Activity,
  ShoppingBag,
  Star,
  Send,
  Plus,
  Sparkles,
  Shield,
  BrainCircuit,
  GitBranch,
  Settings,
  Share2,
  Zap,
  Edit,
  Trash,
  Trash2,
  Download,
  Copy,
  Save,
  Search,
  Filter,
  Link,
  RefreshCw,
  Repeat,
  CheckCircle,
  XCircle,
  PlusCircle,
  AlertTriangle,
  Mail,
  Phone,
  Bell,
  Inbox,
  PenTool,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldCheck,
  ListTodo,
  Calendar,
  Pause,
  Play,
  Hash,
  Target,
  HelpCircle,
};

// ── DynamicIcon — renderiza cualquier ícono del mapa por nombre ───────────────
interface DynamicIconProps extends LucideProps {
  name: string;
  fallback?: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({
  name,
  fallback = 'HelpCircle',
  ...props
}) => {
  const IconComponent = ICON_MAP[name] ?? ICON_MAP[fallback] ?? HelpCircle;
  return <IconComponent {...props} />;
};

// ── Re-exportaciones con alias (compatibilidad con el resto de la app) ─────────
export {
  LayoutDashboard,
  Users,
  Briefcase as BriefcaseIcon,
  FileText as FileTextIcon,
  BarChart2,
  DollarSign as DollarSignIcon,
  BookOpen as BookIcon,
  MessageSquare as MessageSquareIcon,
  FileSignature as FileSignatureIcon,
  Clock as ClockIcon,
  Settings as SettingsIcon,
  Sparkles as SparklesIcon,
  TrendingUp as TrendingUpIcon,
  Share2 as Share2Icon,
  Shield as ShieldIcon,
  BrainCircuit as BrainCircuitIcon,
  Zap as ZapIcon,
  Plus as PlusIcon,
  Star as StarIcon,
  Send as SendIcon,
  User as UserIcon,
  Building,
  Menu as MenuIcon,
  Bell as BellIcon,
  LogOut as LogOutIcon,
  Edit as EditIcon,
  Trash as TrashIcon,
  Phone as PhoneIcon,
  Mail as MailIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  RefreshCw as RefreshCwIcon,
  Repeat as RepeatIcon,
  PlusCircle,
  XCircle as XCircleIcon,
  Search as SearchIcon,
  PenTool as SignatureIcon,
  AlertTriangle as AlertTriangleIcon,
  Copy as CopyIcon,
  ArrowUpCircle as ArrowUpCircleIcon,
  ArrowDownCircle as ArrowDownCircleIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Book,
  Inbox as InboxIcon,
  Link as LinkIcon,
  UserPlus,
  Trash2,
  X,
  Save as SaveIcon,
  GitBranch,
  ShoppingBag,
  CreditCard,
  Filter,
  Activity as ActivityIcon,
  ListTodo,
  Calendar,
  Pause,
  Play,
  Hash,
  Target,
  ShieldCheck as ShieldCheckIcon,
};
