import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect' }) => {
  const baseStyles = "bg-gray-800 animate-pulse";
  const variantStyles = {
    rect: "rounded-lg",
    circle: "rounded-full",
    text: "rounded h-4 w-3/4 mb-2"
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`} aria-hidden="true" />
  );
};

export const CardSkeleton = () => (
  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
    <div className="flex items-center gap-4">
      <Skeleton variant="circle" className="w-12 h-12" />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" className="w-1/2" />
        <Skeleton variant="text" className="w-1/4" />
      </div>
    </div>
    <Skeleton variant="rect" className="h-24 w-full" />
    <div className="flex justify-end gap-2">
      <Skeleton variant="rect" className="w-20 h-8" />
      <Skeleton variant="rect" className="w-20 h-8" />
    </div>
  </div>
);

export const TableRowSkeleton = () => (
  <div className="flex items-center space-x-4 p-4 border-b border-gray-800">
    <Skeleton variant="rect" className="h-4 w-1/4" />
    <Skeleton variant="rect" className="h-4 w-1/4" />
    <Skeleton variant="rect" className="h-4 w-1/6" />
    <Skeleton variant="rect" className="h-4 w-1/6" />
    <Skeleton variant="rect" className="h-8 w-12 ml-auto" />
  </div>
);

export default Skeleton;