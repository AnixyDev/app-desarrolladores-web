import React, { useState, lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { Users as UsersIcon, UserIcon, ShieldIcon, BriefcaseIcon, EditIcon, SaveIcon, TrashIcon, DollarSignIcon } from '../components/icons/Icon';
import { UserData } from '../types';
import { formatCurrency } from '../lib/utils';

const ConfirmationModal = lazy(() => import('../components/modals/ConfirmationModal'));

interface Role {
    id: 'Admin' | 'Manager' | 'Developer';
    name: string;
    description: string;
}

const availableRoles: Role[] = [
  { id: 'Admin', name: 'Administrador', description: 'Acceso total y gestión de configuración, finanzas e integraciones.' },
  { id: 'Manager', name: 'Gerente de Proyecto', description: 'Gestión de proyectos, asignación de tareas y revisión de Timesheets.' },
  { id: 'Developer', name: 'Desarrollador', description: 'Registro de horas, gestión de tareas asignadas y contribución a la Knowledge Base.' },
];

const buttonStyle = 'px-3 py-1 text-sm font-semibold rounded-lg transition duration-200 flex items-center justify-center';

const RoleBadge: React.FC<{ role: Role['id'] }> = ({ role }) => {
    const roleConfig = availableRoles.find(r => r.id === role);
    let color = 'bg-gray-600';
    let IconComponent = UserIcon;

    switch (role) {
        case 'Admin': color = 'bg-fuchsia-600'; IconComponent = ShieldIcon; break;
        case 'Manager': color = 'bg-blue-600'; IconComponent = BriefcaseIcon; break;
        case 'Developer': color = 'bg-teal-600'; IconComponent = UserIcon; break;
    }

    return (
        <span className={`${color} text-white px-3 py-1 text-xs font-medium rounded-full flex items-center`}>
            <IconComponent className="w-3 h-3 mr-1" />{roleConfig?.name || role}
        </span>
    );
};

interface UserRowProps {
    user: UserData;
    onUpdateRole: (id: string, role: Role['id']) => void;
    onUpdateStatus: (id: string, status: UserData['status']) => void;
    onUpdateUserHourlyRate: (id: string, rateCents: number) => void;
    onDeleteUser: (user: UserData) => void;
    currentUserId: string | undefined;
}

const UserRow: React.FC<UserRowProps> = ({ user, onUpdateRole, onUpdateStatus, onUpdateUserHourlyRate, onDeleteUser, currentUserId }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role['id']>(user.role);
    const [hourlyRate, setHourlyRate] = useState<number>(user.hourly_rate_cents);

    const handleSave = () => {
        onUpdateRole(user.id, selectedRole);
        onUpdateUserHourlyRate(user.id, hourlyRate);
        setIsEditing(false);
    };

    const handleStatusToggle = () => {
        onUpdateStatus(user.id, user.status === 'Activo' ? 'Inactivo' : 'Activo');
    };

    const isCurrentUser = user.id === currentUserId;

    return (
        <div className="grid grid-cols-12 gap-4 items-center p-4 border-b border-gray-700 hover:bg-gray-800 transition">
            <div className="col-span-4 text-white"><p className="font-semibold">{user.name.split('(')[0].trim()}</p><p className="text-xs text-gray-400">{user.email}</p></div>
            <div className="col-span-2">
                {isEditing && !isCurrentUser ? (
                    <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as Role['id'])} className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-fuchsia-500 outline-none text-sm">
                        {availableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                    </select>
                ) : <RoleBadge role={user.role} />}
            </div>
            <div className="col-span-2 text-sm text-white">
                {isEditing && !isCurrentUser ? (
                    <div className="relative">
                         <input 
                            type="number"
                            value={hourlyRate / 100}
                            onChange={(e) => setHourlyRate(Math.round(Number(e.target.value) * 100))}
                            className="w-24 p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-fuchsia-500 outline-none text-sm pl-6"
                            step="1"
                        />
                        <DollarSignIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                ) : (
                    <span>{formatCurrency(user.hourly_rate_cents)}/h</span>
                )}
            </div>
            <div className="col-span-1">
                 <button
                    onClick={handleStatusToggle}
                    title={user.status === 'Activo' ? 'Desactivar usuario' : 'Activar usuario'}
                    disabled={isCurrentUser}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                        user.status === 'Activo' ? 'bg-green-500' : 'bg-gray-600'
                    } ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            user.status === 'Activo' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                </button>
            </div>
            <div className="col-span-3 flex justify-end space-x-2">
                {isEditing ? (
                    <button onClick={handleSave} className={`${buttonStyle} bg-green-600 text-white hover:bg-green-700`}><SaveIcon className="w-4 h-4" /></button>
                ) : (
                    <button onClick={() => setIsEditing(true)} disabled={isCurrentUser} className={`${buttonStyle} bg-fuchsia-600 text-black hover:bg-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed`}><EditIcon className="w-4 h-4" /></button>
                )}
                <button onClick={() => onDeleteUser(user)} disabled={isCurrentUser} className={`${buttonStyle} bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed`}><TrashIcon className="w-4 h-4" /></button>
            </div>
        </div>
    );
};

const RoleManagement: React.FC = () => {
    const { users, profile, updateUserRole, updateUserStatus, deleteUser, updateUserHourlyRate } = useAppStore();
    const [isRolesView, setIsRolesView] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);

    const handleDelete = (user: UserData) => {
        setUserToDelete(user);
        setIsConfirmModalOpen(true);
    };

    const confirmDelete = () => {
        if (userToDelete) {
            deleteUser(userToDelete.id);
            setIsConfirmModalOpen(false);
            setUserToDelete(null);
        }
    };

    return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2"><UsersIcon className="w-7 h-7" /> Gestión de Usuarios y Roles</h1>
        <div className="flex items-center space-x-2 rounded-lg bg-gray-800 p-1">
            <button onClick={() => setIsRolesView(false)} className={`px-4 py-2 text-sm font-medium rounded-md transition ${!isRolesView ? 'bg-fuchsia-600 text-black' : 'text-gray-300'}`}>Usuarios</button>
            <button onClick={() => setIsRolesView(true)} className={`px-4 py-2 text-sm font-medium rounded-md transition ${isRolesView ? 'bg-fuchsia-600 text-black' : 'text-gray-300'}`}>Roles</button>
        </div>
      </div>

        {isRolesView ? (
            <div className="space-y-4">
                {availableRoles.map(role => (
                    <div key={role.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <RoleBadge role={role.id} />
                        <p className="text-sm text-gray-400 mt-2">{role.description}</p>
                    </div>
                ))}
            </div>
        ) : (
            <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
                 <div className="grid grid-cols-12 gap-4 items-center p-4 bg-gray-800 text-xs font-semibold uppercase text-gray-400">
                    <div className="col-span-4">Usuario</div>
                    <div className="col-span-2">Rol</div>
                    <div className="col-span-2">Tarifa/Hora</div>
                    <div className="col-span-1">Estado</div>
                    <div className="col-span-3 text-right">Acciones</div>
                </div>
                <div>
                    {users.map(user => (
                        <UserRow 
                            key={user.id} 
                            user={user} 
                            onUpdateRole={updateUserRole}
                            onUpdateStatus={updateUserStatus}
                            onUpdateUserHourlyRate={updateUserHourlyRate}
                            onDeleteUser={handleDelete}
                            currentUserId={profile?.id}
                        />
                    ))}
                </div>
            </div>
        )}
        
        <Suspense fallback={null}>
            {isConfirmModalOpen && (
                <ConfirmationModal 
                    isOpen={isConfirmModalOpen}
                    onClose={() => setIsConfirmModalOpen(false)}
                    onConfirm={confirmDelete}
                    title="¿Eliminar Usuario?"
                    message={`¿Estás seguro de que quieres eliminar a ${userToDelete?.name}? Esta acción es permanente.`}
                />
            )}
        </Suspense>

    </div>
  );
};

export default RoleManagement;