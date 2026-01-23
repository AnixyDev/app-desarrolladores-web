
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg shadow-lg ${className}`}>
      {children}
    </div>
  );
};

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '' }) => {
  return <div className={`p-4 border-b border-gray-800 ${className}`}>{children}</div>;
};


interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className = '' }) => {
  return <div className={`p-4 ${className}`}>{children}</div>;
};


interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}
export const CardFooter: React.FC<CardFooterProps> = ({ children, className = '' }) => {
  return <div className={`p-4 border-t border-gray-800 bg-gray-800/30 rounded-b-lg ${className}`}>{children}</div>;
};

export default Card;