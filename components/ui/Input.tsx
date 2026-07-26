import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  wrapperClassName?: string;
  /** Icono opcional a la izquierda (ej. <MailIcon className="w-4 h-4" />). No afecta a los usos existentes que no lo pasan. */
  icon?: React.ReactNode;
  /** Elemento opcional a la derecha, dentro del input (ej. botón de mostrar/ocultar contraseña). */
  rightElement?: React.ReactNode;
};

const Input: React.FC<InputProps> = ({ label, id, wrapperClassName = '', icon, rightElement, className = '', ...props }) => {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
            {icon}
          </span>
        )}
        <input
          id={id}
          className={`block w-full px-3 py-2 ${icon ? 'pl-10' : ''} ${rightElement ? 'pr-10' : ''} border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white disabled:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {rightElement && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-3">
            {rightElement}
          </span>
        )}
      </div>
    </div>
  );
};

export default Input;