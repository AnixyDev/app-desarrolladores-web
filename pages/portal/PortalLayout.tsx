
import React from 'react';
import { Outlet } from 'react-router-dom';

const PortalLayout: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100">
            <header className="bg-black border-b border-gray-800">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-white">Portal de Cliente</h1>
                    {/* Placeholder for user/logout */}
                </div>
            </header>
            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                <Outlet />
            </main>
        </div>
    );
};

export default PortalLayout;