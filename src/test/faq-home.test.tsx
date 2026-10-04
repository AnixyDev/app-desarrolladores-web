import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FaqHome from '../../components/FaqHome';
import { PREGUNTAS_FAQ, faqJsonLd, tienePendiente, type PreguntaFaq } from '../../lib/faq';

afterEach(() => {
  cleanup();
  document.getElementById('faq-jsonld')?.remove();
});

const PREGUNTAS_PEDIDAS = [
  '¿Calcula automáticamente el IVA y el IRPF?',
  '¿Puedo facturar a clientes extranjeros?',
  '¿Mis facturas cumplen Verifactu?',
  '¿Puedo pasarle los datos a mi gestoría?',
  '¿Qué pasa con mis datos si cancelo?',
  '¿Qué incluye el Plan Fundadores y qué significa «para siempre»?',
  '¿Puedo cancelar cuando quiera?',
];

describe('datos de la FAQ (lib/faq.ts)', () => {
  it('tiene las siete preguntas pedidas, en orden y con ids únicos', () => {
    expect(PREGUNTAS_FAQ.map((p) => p.pregunta)).toEqual(PREGUNTAS_PEDIDAS);
    expect(new Set(PREGUNTAS_FAQ.map((p) => p.id)).size).toBe(PREGUNTAS_FAQ.length);
    for (const p of PREGUNTAS_FAQ) expect(p.respuesta.length, p.id).toBeGreaterThan(0);
  });

  it('el JSON-LD es un FAQPage válido y deja fuera lo pendiente', () => {
    const datos = faqJsonLd() as any;
    expect(datos['@context']).toBe('https://schema.org');
    expect(datos['@type']).toBe('FAQPage');
    const nombres = datos.mainEntity.map((q: any) => q.name);
    for (const p of PREGUNTAS_FAQ) {
      if (tienePendiente(p)) expect(nombres, p.id).not.toContain(p.pregunta);
      else expect(nombres, p.id).toContain(p.pregunta);
    }
    for (const q of datos.mainEntity) {
      expect(q['@type']).toBe('Question');
      expect(q.acceptedAnswer['@type']).toBe('Answer');
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(40);
    }
    expect(JSON.stringify(datos)).not.toMatch(/PENDIENTE/);
  });

  it('sin preguntas publicables no genera JSON-LD', () => {
    const solo: PreguntaFaq[] = [{ id: 'x', pregunta: '¿?', respuesta: ['[PENDIENTE: algo]'] }];
    expect(faqJsonLd(solo)).toBeNull();
  });
});

describe('acordeón de la home', () => {
  it('empieza cerrado y abre/cierra con clic, con aria-expanded y región asociada', () => {
    render(<FaqHome />);
    const boton = screen.getByRole('button', { name: PREGUNTAS_PEDIDAS[0] });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(boton.getAttribute('aria-controls')!)!;
    expect(panel).not.toBeVisible();
    expect(panel).toHaveAttribute('role', 'region');
    expect(panel).toHaveAttribute('aria-labelledby', boton.id);

    fireEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();
    expect(panel.textContent).toContain('base imponible');

    fireEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('se recorre con las flechas, Inicio y Fin', () => {
    render(<FaqHome />);
    const botones = PREGUNTAS_PEDIDAS.map((n) => screen.getByRole('button', { name: n }));
    botones[0].focus();
    fireEvent.keyDown(botones[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(botones[1]);
    fireEvent.keyDown(botones[1], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(botones[0]);
    fireEvent.keyDown(botones[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(botones[6]);
    fireEvent.keyDown(botones[6], { key: 'Home' });
    expect(document.activeElement).toBe(botones[0]);
    fireEvent.keyDown(botones[0], { key: 'End' });
    expect(document.activeElement).toBe(botones[6]);
  });

  it('las preguntas son <button> nativos (Enter y Espacio funcionan sin código extra)', () => {
    render(<FaqHome />);
    for (const n of PREGUNTAS_PEDIDAS) {
      const b = screen.getByRole('button', { name: n });
      expect(b.tagName).toBe('BUTTON');
      expect(b).toHaveAttribute('type', 'button');
    }
  });

  it('resalta lo pendiente y publica el JSON-LD en <head> mientras está montada', () => {
    const { unmount } = render(<FaqHome />);
    if (PREGUNTAS_FAQ.some(tienePendiente)) {
      expect(document.querySelectorAll('mark').length).toBeGreaterThan(0);
    }
    const script = document.getElementById('faq-jsonld');
    expect(script).not.toBeNull();
    expect(script!.getAttribute('type')).toBe('application/ld+json');
    expect(JSON.parse(script!.textContent!)).toEqual(faqJsonLd());
    unmount();
    expect(document.getElementById('faq-jsonld')).toBeNull();
  });

  it('está en la home justo antes del pie', () => {
    const home = readFileSync(resolve(__dirname, '../../pages/LandingPage.tsx'), 'utf8');
    const faq = home.indexOf('<FaqHome />');
    expect(faq).toBeGreaterThan(-1);
    expect(faq).toBeLessThan(home.indexOf('</main>'));
    expect(home.indexOf('</main>')).toBeLessThan(home.indexOf('<PieLegal />'));
  });
});
