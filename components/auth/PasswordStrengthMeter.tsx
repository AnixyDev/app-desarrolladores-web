import React from 'react';

export type PasswordStrength = 0 | 1 | 2 | 3;

// Heurística simple, sin librerías externas: puntúa longitud + variedad de
// caracteres. No pretende ser un análisis criptográfico real (para eso haría
// falta algo como zxcvbn), solo dar una señal visual útil mientras se escribe.
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 3) as PasswordStrength;
}

const LABELS: Record<PasswordStrength, string> = {
  0: 'Muy débil',
  1: 'Débil',
  2: 'Aceptable',
  3: 'Fuerte',
};

const BAR_COLORS: Record<PasswordStrength, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-green-500',
};

const TEXT_COLORS: Record<PasswordStrength, string> = {
  0: 'text-red-400',
  1: 'text-orange-400',
  2: 'text-yellow-400',
  3: 'text-green-400',
};

interface PasswordStrengthMeterProps {
  password: string;
}

const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
  if (!password) return null;
  const strength = getPasswordStrength(password);
  // Con contraseña no vacía, siempre mostramos al menos 1 barra rellena
  // (0 barras rellenas se confundiría visualmente con el estado vacío).
  const filledBars = Math.max(strength, 1);

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < filledBars ? BAR_COLORS[strength] : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs ${TEXT_COLORS[strength]}`}>{LABELS[strength]}</p>
    </div>
  );
};

export default PasswordStrengthMeter;