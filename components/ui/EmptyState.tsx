import React from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  message: string;
  action?: {
    text: string;
    onClick: () => void;
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, message, action }) => {
  return (
    <div className="text-center p-8 bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-700">
      <Icon className="w-12 h-12 mx-auto text-gray-600 mb-4" />
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-gray-400 mt-1">{message}</p>
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.text}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;