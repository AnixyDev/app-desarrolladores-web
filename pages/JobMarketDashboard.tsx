
import React, { useState, lazy, Suspense, useEffect, useMemo } from 'react';
import { Briefcase, DollarSign, Clock, Zap, Target, Filter, ChevronDown, ChevronUp, TrendingUp, Search, Star, BellRing, X } from 'lucide-react';
import { Job } from '../types';
import Button from '../components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../hooks/useToast';

const ProposalGeneratorModal = lazy(() => import('../components/modals/ProposalGeneratorModal'));
const UpgradePromptModal = lazy(() => import('../components/modals/UpgradePromptModal'));

const useDebounce = (value: string, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};


const JobCard: React.FC<{ job: Job, onApply: (job: Job) => void, onSave: (jobId: string) => void, isSaved: boolean }> = ({ job, onApply, onSave, isSaved }) => {
  let compatibilityColor = 'text-red-400 bg-red-900/30';
  if (job.compatibilidadIA >= 80) {
    compatibilityColor = 'text-fuchsia-500 bg-fuchsia-900/30'; 
  } else if (job.compatibilidadIA >= 60) {
    compatibilityColor = 'text-yellow-400 bg-yellow-900/30';
  }

  return (
    <div className={`bg-gray-900 p-6 rounded-xl border transition duration-300 flex flex-col md:flex-row justify-between relative ${job.isFeatured ? 'border-fuchsia-600 shadow-lg shadow-fuchsia-900/30' : 'border-gray-700 hover:border-fuchsia-600'}`}>
      
      {job.isFeatured && (
        <div className="absolute top-0 left-0 -translate-y-1/2 ml-4 px-3 py-1 text-xs font-bold rounded-full flex items-center shadow-lg bg-fuchsia-500 text-black">
            <Star className="w-4 h-4 mr-1"/>
            Destacado
        </div>
      )}
      
      <button onClick={() => onSave(job.id)} className={`absolute top-4 right-4 text-gray-500 hover:text-yellow-400 transition-colors ${isSaved ? 'text-yellow-400' : ''}`} aria-label="Guardar oferta">
        <Star className={`w-6 h-6 ${isSaved ? 'fill-current' : ''}`} />
      </button>


      <div className={`absolute top-0 right-16 m-4 px-3 py-1 text-xs font-bold rounded-full flex items-center shadow-lg ${compatibilityColor}`}>
        <Target className="w-4 h-4 mr-1" />
        Match IA: {job.compatibilidadIA}%
      </div>

      <div className="md:w-3/4 pr-4">
        <Link to={`/job-market/${job.id}`} className="text-xl font-bold text-white mb-2 hover:text-primary-400 transition-colors">{job.titulo}</Link>
        <p className="text-gray-400 mb-4">{job.descripcionCorta}</p>
        
        <div className="flex flex-wrap items-center text-sm text-gray-400 space-x-4 mb-4">
          <span className="flex items-center">
            <DollarSign className="w-4 h-4 mr-1 text-green-400" />
            €{job.presupuesto.toLocaleString('es-ES')} (Fijo)
          </span>
          <span className="flex items-center">
            <Clock className="w-4 h-4 mr-1 text-yellow-400" />
            {job.duracionSemanas} Semanas
          </span>
          <span className="flex items-center text-gray-500">
            {job.fechaPublicacion}
          </span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {job.habilidades.map((skill, index) => (
            <span key={index} className="px-3 py-1 text-xs font-medium rounded-full bg-gray-800 text-fuchsia-500 border border-fuchsia-900/50">
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="md:w-1/4 mt-4 md:mt-0 flex flex-col items-start md:items-end justify-between">
        <p className="text-gray-400 mb-2 text-sm">Cliente: <span className="text-white font-semibold">{job.cliente}</span></p>
        
        <button
          onClick={() => onApply(job)}
          className="w-full md:w-auto mt-2 px-4 py-2 bg-fuchsia-600 text-black font-semibold rounded-lg shadow-md hover:bg-fuchsia-700 transition duration-200 flex items-center justify-center"
        >
          <Zap className="w-4 h-4 mr-2" />
          Aplicar con IA
        </button>
      </div>
    </div>
  );
};

const JobMarketDashboard = () => {
  const { jobs, savedJobIds, saveJob, profile, notifiedJobIds, addNotification, markJobAsNotified } = useAppStore();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [sort, setSort] = useState('match');
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // --- Search & Filter State ---
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [filters, setFilters] = useState({
    skills: [] as string[],
    minBudget: '',
    maxBudget: '',
    minDuration: '',
    maxDuration: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const allSkills = useMemo(() => {
    const skillSet = new Set<string>();
    jobs.forEach(job => job.habilidades.forEach(skill => skillSet.add(skill)));
    return Array.from(skillSet).sort();
  }, [jobs]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
    
  const handleSkillToggle = (skill: string) => {
    setFilters(prev => {
      const currentSkills = prev.skills;
      if (currentSkills.includes(skill)) {
        return { ...prev, skills: currentSkills.filter(s => s !== skill) };
      }
      return { ...prev, skills: [...currentSkills, skill] };
    });
  };

  const clearFilters = () => {
    setFilters({ skills: [], minBudget: '', maxBudget: '', minDuration: '', maxDuration: '' });
    setSearchTerm('');
    setShowFilters(false);
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
        const searchTermMatch = debouncedSearchTerm.length > 0 ?
            job.titulo.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
            job.descripcionLarga.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
            : true;

        const skillsMatch = filters.skills.length > 0 ?
            filters.skills.every(skill => job.habilidades.includes(skill))
            : true;

        const minBudget = parseFloat(filters.minBudget);
        const maxBudget = parseFloat(filters.maxBudget);
        const budgetMatch = 
            (isNaN(minBudget) || job.presupuesto >= minBudget) &&
            (isNaN(maxBudget) || job.presupuesto <= maxBudget);
            
        const minDuration = parseInt(filters.minDuration);
        const maxDuration = parseInt(filters.maxDuration);
        const durationMatch =
            (isNaN(minDuration) || job.duracionSemanas >= minDuration) &&
            (isNaN(maxDuration) || job.duracionSemanas <= maxDuration);

        return searchTermMatch && skillsMatch && budgetMatch && durationMatch;
    });
  }, [jobs, debouncedSearchTerm, filters]);

  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;

        switch (sort) {
        case 'match':
            return b.compatibilidadIA - a.compatibilidadIA;
        case 'budget':
            return b.presupuesto - a.presupuesto;
        default:
            return 0;
        }
    });
  }, [filteredJobs, sort]);

  const handleApplyClick = (job: Job) => {
    // ELIMINADO EL BLOQUEO: Si el usuario es Pro, no debería ver el modal. 
    // Si el perfil no ha cargado aún, esperamos, pero no bloqueamos.
    if (profile?.plan === 'Free') {
        setIsUpgradeModalOpen(true);
    } else {
        setSelectedJob(job);
        setIsProposalModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <TrendingUp className="w-7 h-7 text-fuchsia-500 mr-3" />
            Mercado de Proyectos
          </h1>
          <p className="text-gray-400">
            Descubre oportunidades. Nuestro motor de IA te muestra los proyectos más compatibles con tu perfil.
          </p>
        </header>

        <div className="bg-gray-900 rounded-xl p-4 mb-6 border border-gray-800 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 flex-wrap">
                <div className="relative w-full md:flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Buscar por título, habilidad..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-800 text-white rounded-lg p-3 pl-10 border border-gray-700 focus:border-fuchsia-500 outline-none"
                    />
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                    <Button variant="secondary" onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2">
                        <Filter className="w-4 h-4" />
                        Filtros
                        {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <div className="flex items-center gap-2">
                        <label htmlFor="sort" className="text-sm text-gray-400">Ordenar por:</label>
                        <select 
                        id="sort" 
                        value={sort} 
                        onChange={e => setSort(e.target.value)}
                        className="bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-fuchsia-500 outline-none"
                        >
                        <option value="match">Mejor Match IA</option>
                        <option value="budget">Mayor Presupuesto</option>
                        <option value="date">Más Recientes</option>
                        </select>
                    </div>
                </div>
            </div>

            {showFilters && (
                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-6 animate-fade-in-down">
                    <div>
                        <label className="block text-sm font-medium text-white mb-2">Habilidades</label>
                        <div className="flex flex-wrap gap-2">
                            {allSkills.map(skill => (
                                <button key={skill} type="button" onClick={() => handleSkillToggle(skill)} className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${filters.skills.includes(skill) ? 'bg-fuchsia-600 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                                    {skill}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-white mb-2">Presupuesto (€)</label>
                            <div className="flex items-center gap-2">
                                <input name="minBudget" type="number" placeholder="Mín" value={filters.minBudget} onChange={handleFilterChange} className="w-full bg-gray-700 text-white rounded-lg p-2 border border-gray-600 focus:border-fuchsia-500 outline-none"/>
                                <span>-</span>
                                <input name="maxBudget" type="number" placeholder="Máx" value={filters.maxBudget} onChange={handleFilterChange} className="w-full bg-gray-700 text-white rounded-lg p-2 border border-gray-600 focus:border-fuchsia-500 outline-none"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-white mb-2">Duración (semanas)</label>
                            <div className="flex items-center gap-2">
                                <input name="minDuration" type="number" placeholder="Mín" value={filters.minDuration} onChange={handleFilterChange} className="w-full bg-gray-700 text-white rounded-lg p-2 border border-gray-600 focus:border-fuchsia-500 outline-none"/>
                                <span>-</span>
                                <input name="maxDuration" type="number" placeholder="Máx" value={filters.maxDuration} onChange={handleFilterChange} className="w-full bg-gray-700 text-white rounded-lg p-2 border border-gray-600 focus:border-fuchsia-500 outline-none"/>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={clearFilters} className="flex items-center gap-1"><X className="w-4 h-4"/> Limpiar Filtros</Button>
                    </div>
                </div>
            )}
        </div>

        <div className="space-y-6">
          {sortedJobs.length > 0 ? (
            sortedJobs.map(job => (
              <JobCard key={job.id} job={job} onApply={handleApplyClick} onSave={saveJob} isSaved={savedJobIds.includes(job.id)} />
            ))
          ) : (
            <EmptyState
                icon={Search}
                title="No se encontraron resultados"
                message="Prueba a ajustar o limpiar los filtros para encontrar más ofertas."
                action={{ text: 'Limpiar Filtros', onClick: clearFilters }}
            />
          )}
        </div>
      </div>
      
      <Suspense fallback={null}>
        {selectedJob && isProposalModalOpen && (
          <ProposalGeneratorModal 
              isOpen={isProposalModalOpen}
              onClose={() => setIsProposalModalOpen(false)}
              job={selectedJob}
          />
        )}
        {isUpgradeModalOpen && (
            <UpgradePromptModal
                isOpen={isUpgradeModalOpen}
                onClose={() => setIsUpgradeModalOpen(false)}
                featureName="aplicar a ofertas de trabajo"
            />
        )}
      </Suspense>
    </div>
  );
};
export default JobMarketDashboard;
