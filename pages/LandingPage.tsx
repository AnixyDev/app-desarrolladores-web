import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Logo } from '@/components/icons/Logo';
import Button from '@/components/ui/Button';
import {
  FileCode2,
  FolderOpen,
  ArrowRight,
  GitCommitHorizontal,
  Users,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// Secuencia de la terminal del hero. Se escribe una sola vez al cargar la
// página (no en bucle infinito — un momento orquestado pesa más que un
// efecto que se repite sin parar) y respeta prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────
type TermLine = { text: string; delayAfter?: number };

const TERMINAL_STEPS: TermLine[] = [
  { text: '$ npx devfreelancer init', delayAfter: 500 },
  { text: '✓ cliente creado — "Estudio Marín"', delayAfter: 260 },
  { text: '✓ factura INV-2026-0001 generada (IVA + IRPF automáticos)', delayAfter: 260 },
  { text: '✓ cobro confirmado vía Stripe', delayAfter: 500 },
];

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
};

const TerminalHero: React.FC = () => {
  const reducedMotion = useReducedMotion();
  const [lineIndex, setLineIndex] = useState(reducedMotion ? TERMINAL_STEPS.length : 0);
  const [charIndex, setCharIndex] = useState(reducedMotion ? TERMINAL_STEPS[0].text.length : 0);
  const [showJson, setShowJson] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;

    if (lineIndex >= TERMINAL_STEPS.length) {
      const t = setTimeout(() => setShowJson(true), 300);
      return () => clearTimeout(t);
    }

    const current = TERMINAL_STEPS[lineIndex];
    if (charIndex < current.text.length) {
      const t = setTimeout(() => setCharIndex(c => c + 1), lineIndex === 0 ? 38 : 14);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setLineIndex(i => i + 1);
      setCharIndex(0);
    }, current.delayAfter ?? 200);
    return () => clearTimeout(t);
  }, [lineIndex, charIndex, reducedMotion]);

  const completedLines = TERMINAL_STEPS.slice(0, lineIndex);
  const typingLine = lineIndex < TERMINAL_STEPS.length ? TERMINAL_STEPS[lineIndex].text.slice(0, charIndex) : null;

  return (
    <div className="w-full max-w-2xl mx-auto rounded-xl border border-gray-800 bg-[#0d1117] shadow-2xl shadow-black/40 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-800 bg-[#0a0e14]">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
        <span className="ml-3 text-[11px] font-mono text-gray-500">bash — devfreelancer</span>
      </div>
      <div className="p-5 sm:p-6 font-mono text-[13px] sm:text-sm leading-relaxed min-h-[220px]">
        {completedLines.map((line, i) => (
          <div key={i} className={line.text.startsWith('✓') ? 'text-[#7ee787]' : 'text-gray-200'}>
            {line.text}
          </div>
        ))}
        {typingLine !== null && (
          <div className={typingLine.startsWith('✓') ? 'text-[#7ee787]' : 'text-gray-200'}>
            {typingLine}
            <span className="inline-block w-[7px] h-[1em] align-middle bg-primary-400 ml-0.5 animate-terminal-cursor" />
          </div>
        )}
        {showJson && (
          <div className={`mt-4 pt-4 border-t border-gray-800/80 ${reducedMotion ? '' : 'animate-rise-in'}`}>
            <span className="text-gray-600">// factura.json</span>
            <div className="mt-1">
              <span className="text-gray-400">{'{'}</span>
              <div className="pl-4">
                <span className="text-[#79c0ff]">"invoice"</span>
                <span className="text-gray-500">: </span>
                <span className="text-[#7ee787]">"INV-2026-0001"</span>
                <span className="text-gray-500">,</span>
              </div>
              <div className="pl-4">
                <span className="text-[#79c0ff]">"client"</span>
                <span className="text-gray-500">: </span>
                <span className="text-[#7ee787]">"Estudio Marín"</span>
                <span className="text-gray-500">,</span>
              </div>
              <div className="pl-4">
                <span className="text-[#79c0ff]">"total"</span>
                <span className="text-gray-500">: </span>
                <span className="text-primary-400">"1.240,00 €"</span>
                <span className="text-gray-500">,</span>
              </div>
              <div className="pl-4">
                <span className="text-[#79c0ff]">"status"</span>
                <span className="text-gray-500">: </span>
                <span className="text-[#7ee787]">"paid"</span>
              </div>
              <span className="text-gray-400">{'}'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Revela cada sección al hacer scroll, una sola vez (IntersectionObserver,
// sin dependencias nuevas).
// ─────────────────────────────────────────────────────────────────────────
const useRevealOnScroll = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
};

const Reveal: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const { ref, visible } = useRevealOnScroll();
  return (
    <div ref={ref} className={`${className} ${visible ? 'animate-rise-in' : 'opacity-0'}`}>
      {children}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Módulos del producto, presentados como el árbol de archivos de un editor
// — estructura que encierra información real (son, literalmente, las
// piezas que forman la aplicación), no numeración decorativa.
// ─────────────────────────────────────────────────────────────────────────
const MODULES: { file: string; ext: string; desc: string; color: string }[] = [
  { file: 'facturas', ext: '.ts', desc: 'IVA e IRPF automáticos, numeración correlativa legal', color: 'text-[#79c0ff]' },
  { file: 'proyectos/kanban', ext: '.tsx', desc: 'Tablero visual por cliente, sin hojas de cálculo', color: 'text-[#f0883e]' },
  { file: 'contratos', ext: '.sign()', desc: 'Firma digital del cliente, sin PDFs sueltos por email', color: 'text-primary-400' },
  { file: 'marketplace', ext: '/', desc: 'Publica o encuentra proyectos de otros freelance', color: 'text-[#7ee787]' },
  { file: 'portal-cliente', ext: '.tsx', desc: 'Tu marca, tu color, tu logo — no el nuestro', color: 'text-[#f0883e]' },
  { file: 'equipo/roles', ext: '.ts', desc: 'Invita colaboradores con permisos reales', color: 'text-[#79c0ff]' },
  { file: 'asistente-ia', ext: '.ts', desc: 'Propuestas y previsión financiera en segundos', color: 'text-[#7ee787]' },
];

const COMMITS = [
  { hash: 'a3f9c1e', msg: 'añade tu primer cliente — nombre, email, y ya está' },
  { hash: 'b71e02d', msg: 'genera la factura — IVA, IRPF y numeración, automáticos' },
  { hash: '9c4a88f', msg: 'cobra online — link de pago con Stripe, sin esperar transferencias' },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans selection:bg-primary-500/30">
      {/* ── Nav ── */}
      <nav className="h-20 border-b border-gray-800 flex items-center justify-between px-6 sm:px-12 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <Logo className="h-8 w-8 text-primary-500" />
          <span className="text-xl font-display font-bold tracking-tight">DevFreelancer</span>
        </div>

        <div className="flex items-center gap-6 relative z-[110]">
          <Link to="/pricing" className="hidden sm:block text-sm font-medium text-gray-400 hover:text-white transition-colors">
            Precios
          </Link>
          <button
            onClick={() => navigate('/auth/login')}
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors py-2 px-4"
          >
            Entrar
          </button>
          <Button variant="primary" size="sm" onClick={() => navigate('/auth/register')} className="hidden sm:block">
            Empezar ahora
          </Button>
        </div>
      </nav>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="pt-20 pb-24 px-6 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full border border-gray-800 bg-gray-900/60 font-mono text-xs text-gray-400">
            <span className="text-primary-400">$</span> whoami
          </div>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-6 tracking-tight leading-[1.1]">
            La gestión de tu negocio,<br className="hidden sm:block" /> con la lógica de un desarrollador
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl mb-10 max-w-2xl mx-auto">
            Clientes, proyectos, facturas con IVA/IRPF automático y cobro online. Sin plantillas de Excel, sin PDFs perdidos en el correo.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
            <Button onClick={() => navigate('/auth/register')} className="px-8 py-3.5 text-base">
              Empezar gratis
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/pricing')}
              className="px-8 py-3.5 text-base border-gray-700 hover:bg-gray-900"
            >
              Ver precios
            </Button>
          </div>

          <TerminalHero />
        </section>

        {/* ── Import strip ── */}
        <div className="border-y border-gray-900 bg-gray-950 py-4 overflow-hidden">
          <p className="text-center font-mono text-xs sm:text-sm text-gray-600 px-6 whitespace-nowrap overflow-x-auto">
            import {'{'} Facturas, Proyectos, Presupuestos, Contratos, Marketplace, PortalCliente, AsistenteIA {'}'} from{' '}
            <span className="text-primary-500/70">'devfreelancer'</span>
          </p>
        </div>

        {/* ── Módulos (file tree) ── */}
        <section className="py-24 px-6 max-w-4xl mx-auto">
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-3">Todo tu negocio, en una sola estructura</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Cada pieza que necesitas para facturar y cobrar como freelance, ya montada.</p>
          </Reveal>

          <Reveal>
            <div className="rounded-xl border border-gray-800 bg-[#0d1117] overflow-hidden shadow-xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-[#0a0e14] font-mono text-xs text-gray-500">
                <FolderOpen className="w-3.5 h-3.5 text-primary-400" />
                devfreelancer/
              </div>
              <ul className="divide-y divide-gray-800/60">
                {MODULES.map((m) => (
                  <li key={m.file} className="flex items-start sm:items-center gap-3 px-4 sm:px-6 py-4 hover:bg-gray-900/40 transition-colors flex-col sm:flex-row">
                    <div className="flex items-center gap-2 shrink-0 font-mono text-sm">
                      <FileCode2 className={`w-4 h-4 ${m.color} opacity-80`} />
                      <span className="text-gray-200">{m.file}</span>
                      <span className={m.color}>{m.ext}</span>
                    </div>
                    <span className="hidden sm:inline text-gray-700">—</span>
                    <span className="font-mono text-[13px] text-gray-500">// {m.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* ── Cómo funciona (git log) ── */}
        <section className="py-24 px-6 max-w-3xl mx-auto">
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-3">De cero a cobrado, en tres commits</h2>
            <p className="text-gray-400">Así de directo es el primer día.</p>
          </Reveal>

          <div className="space-y-4">
            {COMMITS.map((c, i) => (
              <Reveal key={c.hash} className="rounded-lg border border-gray-800 bg-gray-900/50 px-5 py-4 flex items-start gap-4" >
                <GitCommitHorizontal className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-mono text-xs text-gray-600 mb-1">
                    {c.hash} <span className="text-gray-700">·</span> paso {i + 1} de {COMMITS.length}
                  </div>
                  <p className="text-gray-200">
                    <span className="text-[#7ee787] font-mono text-sm">feat:</span> {c.msg}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Franja: equipo + IA ── */}
        <section className="py-24 px-6 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <Reveal className="rounded-xl border border-gray-800 bg-gray-900/40 p-8">
            <Users className="w-8 h-8 text-primary-400 mb-4" />
            <h3 className="font-display text-xl font-bold mb-2">No trabajas solo, tu herramienta tampoco debería</h3>
            <p className="text-gray-400">
              Invita colaboradores con permisos reales: ven los proyectos y clientes correctos, registran sus horas, y tú mantienes el control.
            </p>
          </Reveal>
          <Reveal className="rounded-xl border border-gray-800 bg-gray-900/40 p-8">
            <Sparkles className="w-8 h-8 text-primary-400 mb-4" />
            <h3 className="font-display text-xl font-bold mb-2">La IA redacta, tú decides</h3>
            <p className="text-gray-400">
              Propuestas comerciales, previsión financiera y análisis de rentabilidad generados en segundos — siempre editables antes de enviar.
            </p>
          </Reveal>
        </section>

        {/* ── CTA final ── */}
        <section className="py-24 px-6">
          <Reveal className="max-w-2xl mx-auto text-center rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900/80 to-gray-950 p-12">
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">Tu próxima factura, en menos de un minuto</h2>
            <p className="text-gray-400 mb-8">Gratis para empezar. Sin tarjeta.</p>
            <Button onClick={() => navigate('/auth/register')} className="px-8 py-3.5 text-base font-mono">
              $ crea tu cuenta <ArrowRight className="w-4 h-4 ml-2 inline" />
            </Button>
          </Reveal>
        </section>
      </main>

      <footer className="text-center py-8 text-sm text-gray-500 border-t border-gray-900">
        <Link to="/privacy" className="hover:text-primary-400 transition-colors">
          Política de Privacidad
        </Link>
        {' · '}
        <Link to="/terms" className="hover:text-primary-400 transition-colors">
          Términos de Servicio
        </Link>
      </footer>
    </div>
  );
};

export default LandingPage;