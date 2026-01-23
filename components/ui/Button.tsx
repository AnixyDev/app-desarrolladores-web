
import React from 'react';

type ButtonOwnProps<E extends React.ElementType = React.ElementType> = {
  as?: E;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
  className?: string;
}

type ButtonProps<E extends React.ElementType> = ButtonOwnProps<E> & Omit<React.ComponentProps<E>, keyof ButtonOwnProps>;

const defaultElement = 'button';

const Button = <E extends React.ElementType = typeof defaultElement>({
  children,
  as,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps<E>) => {
  const Tag: React.ElementType = as || defaultElement;

  const baseStyles = 'inline-flex items-center justify-center rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const variantStyles = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  const sizeStyles = {
    sm: 'px-2 py-2 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };
  
  const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

  return (
    <Tag className={combinedClassName} {...props}>
        {children}
    </Tag>
  );
};

export default Button;