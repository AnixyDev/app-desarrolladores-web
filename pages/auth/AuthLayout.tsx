import React from 'react';
import { Outlet } from 'react-router-dom';
import { Logo } from '../../components/icons/Logo.tsx';

const AuthLayout: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center p-4">
            <div className="flex items-center mb-8">
                <Logo className="h-10 w-10 mr-3" />
                <span className="text-3xl font-bold text-white">DevFreelancer</span>
            </div>
            <main className="w-full max-w-md">
                <Outlet />
            </main>
        </div>
    );
};
export default AuthLayout;