import React, { useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Mail, Phone, Download, CheckCircle, XCircle, Clock, Search } from '@/components/icons/Icon';

interface Applicant {
  id: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  status: 'pending' | 'accepted' | 'rejected';
  appliedDate: string;
  experience: string;
}

const JobApplicantsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [applicants, setApplicants] = useState<Applicant[]>([
    {
      id: '1',
      name: 'Laura García',
      email: 'laura.garcia@example.com',
      phone: '+34 600 000 001',
      position: 'Frontend Developer',
      status: 'pending',
      appliedDate: '2026-04-20',
      experience: '5 años en React y Tailwind CSS'
    },
    {
      id: '2',
      name: 'Carlos Rodríguez',
      email: 'carlos.rodriguez@example.com',
      phone: '+34 600 000 002',
      position: 'UX/UI Designer',
      status: 'accepted',
      appliedDate: '2026-04-18',
      experience: 'Especialista en Figma y sistemas de diseño'
    }
  ]);

  const filteredApplicants = applicants.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateStatus = (id: string, newStatus: Applicant['status']) => {
    setApplicants(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  };

  const statusBadge = (status: Applicant['status']) => {
    switch (status) {
      case 'accepted': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/30 uppercase">Aceptado</span>;
      case 'rejected': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30 uppercase">Rechazado</span>;
      default: return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30 uppercase">Pendiente</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Candidatos</h1>
        <p className="text-gray-400">Gestiona las solicitudes de empleo para tus proyectos o agencia</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          type="text"
          placeholder="Buscar por nombre o puesto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredApplicants.map(applicant => (
          <Card key={applicant.id} className="hover:border-gray-600 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row justify-between gap-6">
                <div className="flex-1 space-y-4">
                  <div className="flex items-start justify-between lg:justify-start lg:gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{applicant.name}</h3>
                      <p className="text-primary-400 font-medium">{applicant.position}</p>
                    </div>
                    {statusBadge(applicant.status)}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      {applicant.email}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {applicant.phone}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Aplicó el {new Date(applicant.appliedDate).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Experiencia</p>
                    <p className="text-sm text-gray-300">{applicant.experience}</p>
                  </div>
                </div>

                <div className="flex lg:flex-col justify-end gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="flex-1 lg:flex-none">
                    <Download className="w-4 h-4 mr-2" /> CV
                  </Button>
                  {applicant.status === 'pending' && (
                    <>
                      <Button 
                        size="sm" 
                        className="flex-1 lg:flex-none bg-green-600 hover:bg-green-700"
                        onClick={() => updateStatus(applicant.id, 'accepted')}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" /> Aceptar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1 lg:flex-none text-red-400 border-red-500/30 hover:bg-red-500/10"
                        onClick={() => updateStatus(applicant.id, 'rejected')}
                      >
                        <XCircle className="w-4 h-4 mr-2" /> Rechazar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default JobApplicantsPage;
