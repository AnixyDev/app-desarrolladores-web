
import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { BookIcon, PlusIcon, SearchIcon, EditIcon, TrashIcon, SparklesIcon, FileSignatureIcon, BrainCircuitIcon } from '../components/icons/Icon';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { KnowledgeArticle } from '../types';
import { useAppStore } from '../hooks/useAppStore';
import { AI_CREDIT_COSTS, rankArticlesByRelevance } from '../services/geminiService';
import { useToast } from '../hooks/useToast';

const BuyCreditsModal = lazy(() => import('../components/modals/BuyCreditsModal'));
const ConfirmationModal = lazy(() => import('../components/modals/ConfirmationModal'));

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


const KnowledgeBase: React.FC = () => {
    const { profile, consumeCredits } = useAppStore();
    const { addToast } = useToast();

    const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 500);
    const [rankedArticleIds, setRankedArticleIds] = useState<string[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
    const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [articleToDelete, setArticleToDelete] = useState<KnowledgeArticle | null>(null);
    
    const [currentArticle, setCurrentArticle] = useState<Partial<KnowledgeArticle> | null>(null);
    const [generatorTopic, setGeneratorTopic] = useState('');
    const [quizResult, setQuizResult] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);
    
    useEffect(() => {
        const performSearch = async () => {
            if (debouncedSearchTerm.trim().length > 2) {
                if(profile.ai_credits < AI_CREDIT_COSTS.searchKnowledgeBase) {
                    addToast("No tienes suficientes créditos para la búsqueda IA.", "error");
                    return;
                }
                setIsLoading(true);
                try {
                    const rankedIds = await rankArticlesByRelevance(debouncedSearchTerm, articles);
                    setRankedArticleIds(rankedIds);
                    consumeCredits(AI_CREDIT_COSTS.searchKnowledgeBase);
                } catch(e) {
                     addToast((e as Error).message, 'error');
                } finally {
                    setIsLoading(false);
                }
            } else {
                setRankedArticleIds([]);
            }
        };
        performSearch();
    }, [debouncedSearchTerm, articles, profile.ai_credits, consumeCredits, addToast]);


    const displayedArticles = useMemo(() => {
        if (debouncedSearchTerm.trim() && rankedArticleIds.length > 0) {
            return [...articles].sort((a, b) => rankedArticleIds.indexOf(a.id) - rankedArticleIds.indexOf(b.id));
        }
        return articles;
    }, [articles, rankedArticleIds, debouncedSearchTerm]);
    
    const openModal = (article: Partial<KnowledgeArticle> | null = null) => {
        setCurrentArticle(article || { title: '', content: '', tags: [] });
        setIsModalOpen(true);
    };
    
    const handleSave = () => {
        if (!currentArticle?.title || !currentArticle?.content) return;
        
        if (currentArticle.id) {
            setArticles(articles.map(a => a.id === currentArticle.id ? { ...a, ...currentArticle, updated_at: new Date().toISOString().slice(0, 10) } : a));
        } else {
            const newArticle = { ...currentArticle, id: `kb-${Date.now()}`, created_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString().slice(0, 10) };
            setArticles([...articles, newArticle as KnowledgeArticle]);
        }
        setIsModalOpen(false);
    };
    
    const handleDelete = (article: KnowledgeArticle) => {
        setArticleToDelete(article);
        setIsConfirmModalOpen(true);
    };

    const confirmDelete = () => {
        if (articleToDelete) {
            setArticles(articles.filter(a => a.id !== articleToDelete.id));
            setIsConfirmModalOpen(false);
            setArticleToDelete(null);
        }
    };
    
    const handleGenerateDocument = () => {
        if (profile?.ai_credits === undefined || profile.ai_credits < AI_CREDIT_COSTS.generateDocument) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        setIsLoading(true);
        // Simulate AI call
        setTimeout(() => {
            const generatedContent = `Este es un documento generado por IA sobre "${generatorTopic}".\n\nSección 1: ...\nSección 2: ...`;
            setCurrentArticle({ title: generatorTopic, content: generatedContent, tags: [generatorTopic.toLowerCase()] });
            setIsGeneratorModalOpen(false);
            setIsModalOpen(true);
            setIsLoading(false);
            consumeCredits(AI_CREDIT_COSTS.generateDocument);
            addToast('Documento generado con IA', 'success');
        }, 2000);
    };

    const handleGenerateQuiz = () => {
        if (!currentArticle?.content) return;
        if (profile?.ai_credits === undefined || profile.ai_credits < AI_CREDIT_COSTS.generateQuiz) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        setIsLoading(true);
        setTimeout(() => {
            const quiz = `Cuestionario sobre "${currentArticle.title}":\n\n1. ¿Cuál es el primer paso del despliegue?\n2. ...`;
            setQuizResult(quiz);
            setIsQuizModalOpen(true);
            setIsLoading(false);
            consumeCredits(AI_CREDIT_COSTS.generateQuiz);
            addToast('Cuestionario generado', 'success');
        }, 2000);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold text-white flex items-center gap-2"><BookIcon/> Knowledge Base del Equipo</h1>
                <div className="flex gap-2">
                    <Button onClick={() => setIsGeneratorModalOpen(true)} variant="secondary"><FileSignatureIcon className="w-4 h-4 mr-2"/>Generar Documento con IA</Button>
                    <Button onClick={() => openModal()}><PlusIcon className="w-4 h-4 mr-2"/>Nuevo Artículo</Button>
                </div>
            </div>

            <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input placeholder="Búsqueda semántica con IA..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                {isLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary-400">Buscando...</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedArticles.map(article => (
                    <Card key={article.id} className="flex flex-col">
                        <CardHeader>
                            <h3 className="text-lg font-semibold text-primary-400 truncate">{article.title}</h3>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <p className="text-sm text-gray-400 line-clamp-3">{article.content}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {article.tags.map(tag => <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">{tag}</span>)}
                            </div>
                        </CardContent>
                        <div className="p-4 border-t border-gray-800 flex justify-between items-center text-xs text-gray-500">
                            <span>Actualizado: {article.updated_at}</span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="secondary" onClick={() => openModal(article)}><EditIcon className="w-4 h-4"/></Button>
                                <Button size="sm" variant="danger" onClick={() => handleDelete(article)}><TrashIcon className="w-4 h-4"/></Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Edit/Create Modal */}
            {isModalOpen && currentArticle && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={currentArticle.id ? "Editar Artículo" : "Nuevo Artículo"}>
                    <div className="space-y-4">
                        <Input label="Título" value={currentArticle.title} onChange={(e) => setCurrentArticle(prev => ({...prev, title: e.target.value}))} />
                        <textarea value={currentArticle.content} onChange={(e) => setCurrentArticle(prev => ({...prev, content: e.target.value}))} rows={10} className="w-full p-2 bg-gray-800 text-gray-300 border border-gray-700 rounded-md" placeholder="Contenido del artículo (soporta Markdown)..." />
                        <Input label="Tags (separados por comas)" value={Array.isArray(currentArticle.tags) ? currentArticle.tags.join(', ') : ''} onChange={(e) => setCurrentArticle(prev => ({...prev, tags: e.target.value.split(',').map(t => t.trim())}))} />
                        <div className="flex justify-between pt-4">
                             <Button variant="secondary" onClick={handleGenerateQuiz} disabled={!currentArticle.content || isLoading}><BrainCircuitIcon className="w-4 h-4 mr-2"/>Crear Cuestionario</Button>
                             <Button onClick={handleSave}>Guardar Artículo</Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* AI Generator Modal */}
            <Modal isOpen={isGeneratorModalOpen} onClose={() => setIsGeneratorModalOpen(false)} title="Generar Documento con IA">
                <div className="space-y-4">
                    <Input label="Tema del Documento" placeholder="Ej: Guía de estilo para Python" value={generatorTopic} onChange={(e) => setGeneratorTopic(e.target.value)} />
                    <p className="text-xs text-gray-400">La IA creará una plantilla de documento sobre este tema que luego podrás editar.</p>
                    <div className="flex justify-end pt-2">
                        <Button onClick={handleGenerateDocument} disabled={isLoading || !generatorTopic}>
                            <SparklesIcon className="w-4 h-4 mr-2" />
                            {isLoading ? 'Generando...' : `Generar (${AI_CREDIT_COSTS.generateDocument} créditos)`}
                        </Button>
                    </div>
                </div>
            </Modal>
            
            {/* AI Quiz Modal */}
             <Modal isOpen={isQuizModalOpen} onClose={() => setIsQuizModalOpen(false)} title="Cuestionario Generado por IA">
                <div className="space-y-4">
                    <pre className="whitespace-pre-wrap bg-gray-800 p-4 rounded-md text-sm">{quizResult}</pre>
                </div>
            </Modal>
            
            <Suspense fallback={null}>
                {isBuyCreditsModalOpen && <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />}
                {isConfirmModalOpen && (
                    <ConfirmationModal
                        isOpen={isConfirmModalOpen}
                        onClose={() => setIsConfirmModalOpen(false)}
                        onConfirm={confirmDelete}
                        title="¿Eliminar Artículo?"
                        message={`¿Estás seguro de que quieres eliminar permanentemente el artículo "${articleToDelete?.title}"?`}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default KnowledgeBase;
