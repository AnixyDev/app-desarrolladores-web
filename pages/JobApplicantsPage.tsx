// pages/JobApplicantsPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { CheckCircleIcon as CheckCircle, XCircleIcon as XCircle, ClockIcon as Clock } from '@/components/icons/Icon';
import { Users, ArrowLeft } from 'lucide-react';
import { JobApplicationStatus } from '@/types';

const statusBadge = (status: JobApplicationStatus) => {
  switch (status) {
    case 'accepted':
      return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/30 uppercase">Aceptado</span>;
    case 'rejected':
      return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30 uppercase">Rechazado</span>;
    case 'viewed':
      return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 uppercase">En revisión</span>;
    default:
      return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30 uppercase">Pendiente</span>;
  }
};

const JobApplicantsPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { getJobById, getApplicationsByJobId, viewApplication, updateApplicationStatus } = useAppStore();
  const { addToast } = useToast();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const job = jobId ? getJobById(jobId) : undefined;
  const applicants = useMemo(() => (jobId ? getApplicationsByJobId(jobId) : []), [jobId, getApplicationsByJobId]);

  useEffect(() => {
    applicants.forEach(app => {
      if (app.status === 'sent') viewApplication(app.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleStatusChange = async (applicationId: string, status: 'accepted' | 'rejected') => {
    setUpdatingId(applicationId);
    const result = await updateApplicationStatus(applicationId, status);
    setUpdatingId(null);
    if (!result.success) {
      addToast(result.message || 'No se pudo actualizar la postulación.', 'error');
    }
  };

  if (!job) {
    return <div className="text-center text-red-500">Oferta no encontrada.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/my-job-posts" className="text-sm text-primary-400 hover:underline flex items-center gap-1 mb-2">
          <ArrowLeft className="w-4 h-4" /> Volver a mis ofertas
        </Link>
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Users className="w-6 h-6" /> Candidatos para "{job.titulo}"
        </h1>
      </div>

      {applicants.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aún no has recibido postulaciones"
          message="Cuando alguien se postule a esta oferta, aparecerá aquí."
        />
      ) : (
        <div className="space-y-4">
          {applicants.map(applicant => (
            <Card key={applicant.id}>
              <CardContent className="flex flex-col lg:flex-row justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-white text-lg">{applicant.applicantName}</h3>
                    {statusBadge(applicant.status)}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Clock className="w-4 h-4" />
                    Aplicó el {new Date(applicant.appliedAt).toLocaleDateString('es-ES')}
                  </div>

                  <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Propuesta</p>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{applicant.proposalText}</p>
                  </div>
                </div>

                <div className="flex lg:flex-col justify-end gap-2 shrink-0">
                  {(applicant.status === 'sent' || applicant.status === 'viewed') && (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 lg:flex-none bg-green-600 hover:bg-green-700"
                        disabled={updatingId === applicant.id}
                        onClick={() => handleStatusChange(applicant.id, 'accepted')}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" /> Aceptar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1 lg:flex-none text-red-400 border-red-500/30 hover:bg-red-500/10"
                        disabled={updatingId === applicant.id}
                        onClick={() => handleStatusChange(applicant.id, 'rejected')}
                      >
                        <XCircle className="w-4 h-4 mr-2" /> Rechazar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobApplicantsPage;