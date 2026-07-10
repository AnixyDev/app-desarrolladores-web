import React from 'react';

type ButtonOwnProps<E extends React.ElementType = React.ElementType> = {
  as?: E;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

type ButtonProps<E extends React.ElementType> = ButtonOwnProps<E> & Omit<React.ComponentProps<E>, keyof ButtonOwnProps>;

const defaultElement = 'button';

const Button = <E extends React.ElementType = typeof defaultElement>({
  children,
  as,
  variant = 'primary',
  size = 'md',
  className = '',
  isLoading = false,
  disabled,
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
    <Tag className={combinedClassName} disabled={disabled || isLoading} {...props}>
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
    </Tag>
  );
};

export default Button;
