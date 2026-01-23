import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  wrapperClassName?: string;
};

const Input: React.FC<InputProps> = ({ label, id, wrapperClassName = '', ...props }) => {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        id={id}
        className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white disabled:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed"
        {...props}
      />
    </div>
  );
};

export default Input;