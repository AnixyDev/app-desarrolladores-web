
import React from 'react';

export const Logo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <linearGradient id="logoGradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F000B8"/>
                <stop offset="1" stopColor="#9D00FF"/>
            </linearGradient>
        </defs>
        <text
            x="50%"
            y="52%"
            dominant-baseline="middle"
            text-anchor="middle"
            fontSize="22"
            fontFamily="Inter, sans-serif"
            fontWeight="800"
            fill="url(#logoGradient)"
        >
            DF
        </text>
    </svg>
);