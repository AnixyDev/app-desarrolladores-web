
import React from 'react';

export const Logo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <linearGradient id="logoGradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F000B8"/>
                <stop offset="1" stopColor="#9D00FF"/>
            </linearGradient>
        </defs>
        {/*
          CAMBIO: React espera los atributos SVG en camelCase. En kebab-case
          (dominant-baseline / text-anchor) los trataba como propiedades DOM
          desconocidas y avisaba en consola en cada render del Sidebar:
            Warning: Invalid DOM property `dominant-baseline`.
          Se veía bien porque React acaba pasándolos al DOM igualmente.
          Ojo: en index.html el héroe estático los lleva en kebab-case y así
          deben quedarse — allí es SVG dentro de HTML, no JSX.
        */}
        <text
            x="50%"
            y="52%"
            dominantBaseline="middle"
            textAnchor="middle"
            fontSize="22"
            fontFamily="Inter, sans-serif"
            fontWeight="800"
            fill="url(#logoGradient)"
        >
            DF
        </text>
    </svg>
);
