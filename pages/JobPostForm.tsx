
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Briefcase, DollarSign, Clock, Hash, Send, Zap, Star } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { redirectToCheckout } from '../services/stripeService';
import { useAppStore } from '../hooks/useAppStore';
import { useNavigate } from 'react-router-dom';

const commonSkills = [
  'Angular', 'AWS', 'CSS', 'Docker', 'Firebase', 'Go', 'GCP (Google Cloud)',
  'HTML', 'Java', 'JavaScript', 'Kubernetes', 'PHP (Laravel)', 'MongoDB', 
  'MySQL', 'Next.js', 'Node.js', 'PostgreSQL', 'Python (Django/Flask)', 
  'React', 'Svelte', 'Tailwind CSS', 'TypeScript', 'Vue.js',
];

const UpgradePromptModal = lazy(() => import('../components/modals/UpgradePromptModal'));

interface FormData {
    titulo: string;
    descripcion: string;
    presupuesto: string;
    duracionSemanas: string;
    habilidadesRequeridas: string[];
}

interface InputFieldProps {
    label: string;
    name: keyof Omit<FormData, 'habilidadesRequeridas' | 'descripcion'>;
    type?: string;
    icon: React.ElementType;
    required?: boolean;
}

const JobPostForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    titulo: '',
    descripcion: '',
    presupuesto: '',
    duracionSemanas: '',
    habilidadesRequeridas: [],
  });
  const [isFeatured, setIsFeatured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const { addToast } = useToast();
  const { profile, addJob } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    // CORRECCIÓN: Permitir acceso si es Pro o Teams
    if (profile && profile.plan === 'Free') {
      setIsUpgradeModalOpen(true);
    }
  }, [profile?.plan]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSkillToggle = (skill: string) => {
    setFormData(prev => {
      const currentSkills = prev.habilidadesRequeridas;
      if (currentSkills.includes(skill)) {
        return { ...prev, habilidadesRequeridas: currentSkills.filter(s => s !== skill) };
      } else {
        return { ...prev, habilidadesRequeridas: [...currentSkills, skill] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isFeatured) {
        setIsLoading(true);
        try {
            await redirectToCheckout('featuredJobPost');
        } catch (error) {
            addToast((error as Error).message, 'error');
            setIsLoading(false);
        }
    } else {
        if (!profile) {
            addToast('No se pudo identificar al usuario.', 'error');
            return;
        }
        const newJob = {
            titulo: formData.titulo,
            descripcionCorta: formData.descripcion.substring(0, 100) + '...',
            descripcionLarga: formData.descripcion,
            presupuesto: parseFloat(formData.presupuesto) || 0,
            duracionSemanas: parseInt(formData.duracionSemanas, 10) || 0,
            habilidades: formData.habilidadesRequeridas,
            cliente: profile.business_name || profile.full_name,
            fechaPublicacion: "Recién publicado",
            isFeatured: false,
            compatibilidadIA: 100, 
            postedByUserId: profile.id
        };
        await addJob(newJob);
        addToast('¡Oferta de trabajo publicada con éxito!', 'success');
        navigate('/my-job-posts');
    }
  };

  if (isUpgradeModalOpen && profile?.plan === 'Free') {
    return (
        <Suspense fallback={null}>
            <UpgradePromptModal
                isOpen={isUpgradeModalOpen}
                onClose={() => navigate('/job-market')}
                featureName="publicar ofertas de trabajo"
            />
        </Suspense>
    );
  }

  const InputField: React.FC<InputFieldProps> = ({ label, name, type = 'text', icon: Icon, required = false }) => (
    <div className="mb-4">
      <label htmlFor={name} className="block text-sm font-medium text-white mb-2 flex items-center">
        {Icon && <Icon className="w-4 h-4 text-fuchsia-500 mr-2" />}
        {label} {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        value={formData[name]}
        onChange={handleChange}
        className="w-full px-4 py-3 bg-gray-800 text-white border border-gray-700 rounded-xl focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none transition duration-150"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex justify-center items-start p-4 sm:p-8">
      <div className="w-full max-w-3xl bg-gray-900 rounded-3xl shadow-2xl shadow-fuchsia-900/50 p-6 sm:p-10 border-t-8 border-fuchsia-600 my-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
          <Briefcase className="w-7 h-7 text-fuchsia-500 mr-3" />
          Publicar Nueva Oferta
        </h1>
        <p className="text-gray-400 mb-8">
          Detalla tu proyecto para que el talento compatible pueda encontrarte.
        </p>

        <form onSubmit={handleSubmit}>
          <InputField label="Título del Proyecto" name="titulo" icon={Briefcase} required />
          <div className="mb-6">
            <label htmlFor="descripcion" className="block text-sm font-medium text-white mb-2 flex items-center">
              <Zap className="w-4 h-4 text-fuchsia-500 mr-2" />
              Descripción Detallada <span className="text-red-500 ml-1">*</span>
            </label>
            <textarea id="descripcion" name="descripcion" required rows={6} value={formData.descripcion} onChange={handleChange} className="w-full px-4 py-3 bg-gray-800 text-white border border-gray-700 rounded-xl focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none transition duration-150" placeholder="Describe los objetivos..."/>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <InputField label="Presupuesto Máximo (€)" name="presupuesto" type="number" icon={DollarSign} required />
            <InputField label="Duración Estimada (Semanas)" name="duracionSemanas" type="number" icon={Clock} required />
          </div>
          <div className="mb-8">
            <label className="block text-sm font-medium text-white mb-3 flex items-center">
              <Hash className="w-4 h-4 text-fuchsia-500 mr-2" />
              Habilidades Requeridas
            </label>
            <div className="flex flex-wrap gap-2 p-4 bg-gray-800 rounded-xl border border-gray-700">
              {commonSkills.map(skill => (
                <button key={skill} type="button" onClick={() => handleSkillToggle(skill)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors duration-200 ${formData.habilidadesRequeridas.includes(skill) ? 'bg-fuchsia-600 text-black shadow-lg shadow-fuchsia-500/50' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  {skill}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isLoading} className="w-full sm:w-auto px-8 py-3 font-semibold rounded-lg transition duration-200 bg-fuchsia-600 text-black hover:bg-fuchsia-700 shadow-lg shadow-fuchsia-500/50 flex items-center justify-center">
              <Send className="w-5 h-5 mr-2" />
              {isLoading ? 'Cargando...' : 'Publicar Oferta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JobPostForm;
