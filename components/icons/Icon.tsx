import React from 'react';
import * as Icons from 'lucide-react';
import { LucideProps } from 'lucide-react';
import { IconName } from '@/types';

// 1. EL COMPONENTE PRO: Permite renderizar cualquier icono pasando solo el nombre
interface DynamicIconProps extends LucideProps {
  name: string;
  fallback?: IconName;
}

export const DynamicIcon = ({ 
  name, 
  fallback = 'HelpCircle', 
  ...props 
}: DynamicIconProps) => {
  // Buscamos el componente en la librería Lucide
  const IconComponent = (Icons as any)[name] || (Icons as any)[fallback];

  if (!IconComponent) return null;

  return <IconComponent {...props} />;
};

// 2. MANTENEMOS TUS EXPORTACIONES ACTUALES (para no romper el resto de la app)
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
} from 'lucide-react';
