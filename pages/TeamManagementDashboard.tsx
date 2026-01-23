import React, { useState, lazy, Suspense } from 'react';
// FIX: Switched to the centralized Icon wrapper for consistency and added the missing User icon.
import { Users, UserPlus, Trash2, MailIcon as Mail, X, UserIcon as User } from '../components/icons/Icon';
import { useAppStore } from '../hooks/useAppStore';
import { UserData } from '../types';

const ConfirmationModal = lazy(() => import('../components/modals/ConfirmationModal'));

const roles: UserData['role'][] = [
  'Developer', 
  'Manager', 
  'Admin',
];

interface NewMember {
    name: string;
    email: string;
    role: UserData['role'];
}

const TeamManagementDashboard: React.FC = () => {
  const { users, inviteUser, deleteUser } = useAppStore();
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<UserData | null>(null);
  const [newMember, setNewMember] = useState<NewMember>({ name: '', email: '', role: roles[0] });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name || !newMember.email) return;
    
    inviteUser(newMember.name, newMember.email, newMember.role);
    setNewMember({ name: '', email: '', role: roles[0] });
    setShowInviteModal(false);
  };

  const handleDelete = (member: UserData) => {
    setMemberToDelete(member);
    setIsConfirmModalOpen(true);
  };
  
  const confirmDelete = () => {
      if (memberToDelete) {
          deleteUser(memberToDelete.id);
          setIsConfirmModalOpen(false);
          setMemberToDelete(null);
      }
  };
  
  const getStatusStyle = (status: UserData['status']) => {
    switch (status) {
      case 'Activo': return 'bg-green-900/50 text-green-400 border border-green-700';
      case 'Pendiente': return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700';
      case 'Inactivo': return 'bg-gray-700/50 text-gray-400 border border-gray-600';
      default: return 'bg-gray-700/50 text-gray-400 border border-gray-600';
    }
  };

  const InviteMemberModal = () => (
    <div className="fixed inset-0 bg-gray-950 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-lg border border-fuchsia-600/50 shadow-2xl">
        <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center"><UserPlus className="w-6 h-6 mr-3 text-fuchsia-500" /> Invitar Nuevo Miembro</h2>
          <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-white"><X /></button>
        </div>
        
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Completo</label>
            <input
              type="text"
              value={newMember.name}
              onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
              className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Correo Electrónico</label>
            <input
              type="email"
              value={newMember.email}
              onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
              className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Rol y Permisos</label>
            <select
              value={newMember.role}
              onChange={(e) => setNewMember({ ...newMember, role: e.target.value as UserData['role'] })}
              className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-fuchsia-500 outline-none"
            >
              {roles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">El rol define su acceso a Facturación, Proyectos y CRM.</p>
          </div>
          
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 font-semibold rounded-lg transition duration-200 bg-fuchsia-600 text-black hover:bg-fuchsia-700 shadow-lg shadow-fuchsia-500/50 flex items-center"
            >
              <Mail className="w-5 h-5 mr-2" />
              Enviar Invitación
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      {showInviteModal && <InviteMemberModal />}

      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Users className="w-7 h-7 text-fuchsia-500 mr-3" />
            DevFreelancer Teams
          </h1>
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-6 py-2 font-semibold rounded-lg transition duration-200 bg-fuchsia-600 text-black hover:bg-fuchsia-700 shadow-md shadow-fuchsia-500/30 flex items-center"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Invitar Miembro
          </button>
        </header>

        <div className="bg-gray-900 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-800 pb-2">Miembros del Equipo ({users.length})</h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="text-xs text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="p-4">Miembro</th>
                  <th className="p-4">Rol</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Invitado el</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(member => (
                  <tr key={member.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                    <td className="p-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                          <User className="text-fuchsia-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{member.name}</p>
                          <p className="text-sm text-gray-400">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                        <p className="text-white">{member.role}</p>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusStyle(member.status)}`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-300">{member.invitedOn || 'N/A'}</td>
                    <td className="p-4 text-right">
                      <button onClick={() => handleDelete(member)} className="text-gray-400 hover:text-red-500 p-2 rounded-full transition duration-200">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <Suspense fallback={null}>
        {isConfirmModalOpen && (
          <ConfirmationModal
            isOpen={isConfirmModalOpen}
            onClose={() => setIsConfirmModalOpen(false)}
            onConfirm={confirmDelete}
            title="Eliminar Miembro del Equipo"
            message={`¿Estás seguro de que quieres eliminar a ${memberToDelete?.name} del equipo? Se revocará su acceso permanentemente.`}
          />
        )}
      </Suspense>
    </div>
  );
};

export default TeamManagementDashboard;