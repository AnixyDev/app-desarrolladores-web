/**
 * Prueba de humo de las paginas privadas.
 *
 * QUE HACE
 * Levanta un servidor estatico sobre dist/, abre un Chromium, inicia sesion
 * contra un Supabase simulado y recorre las 35 rutas de detras del login.
 * Una pagina se considera ROTA si lanza una excepcion, si aparece el
 * ErrorBoundary ("Algo salió mal"), si se queda practicamente vacia, o si
 * escupe un error de consola.
 *
 * POR QUE DOS PASADAS
 *  - "lleno": cada tabla devuelve filas con todas las columnas rellenas.
 *  - "nulos": todas las columnas que el esquema declara NULLABLE llegan a
 *    NULL. Esta es la que vale: los datos reales tienen huecos (un gasto sin
 *    proyecto, un fichaje sin cerrar, un contrato sin firmar) y ahi es donde
 *    revientan las interfaces, con .replace() sobre undefined o .map() sobre
 *    null. Sin esta pasada el test da una falsa sensacion de seguridad.
 *
 * Y UNA TERCERA: "publicas", SIN SESION
 * Las paginas a las que llega quien no ha entrado: login, registro, portal
 * del cliente, precios, pago de facturas. Cada una tiene que ENSEÑAR un texto
 * suyo concreto — no vale medir cuanto texto hay, porque el banner de cookies
 * ya pasa de 40 caracteres. Asi es como /portal/login estuvo dos meses en
 * negro sin que esta prueba lo viera: solo miraba paginas con sesion.
 *
 * LO QUE NO PRUEBA
 * Que los numeros sean correctos ni que los formularios guarden. Solo que
 * ninguna pagina se cae al pintarse. Eso ya cubre la clase de fallo que
 * introduce un cambio global en el store (por ejemplo, tocar los selectores
 * de Zustand en 50 componentes a la vez).
 *
 * MANTENIMIENTO
 * ESQUEMA de abajo es una copia del esquema real. Si anades o cambias
 * columnas, actualizalo con esta consulta:
 *
 *   select table_name || ':' || string_agg(column_name || '=' ||
 *     case when data_type like '%int%' then 'i' when data_type like '%bool%' then 'b'
 *          when data_type like '%json%' then 'j'
 *          when data_type like '%time%' or data_type='date' then 'd'
 *          when data_type like '%numeric%' or data_type like '%double%' then 'n'
 *          when data_type = 'ARRAY' then 'a' else 't' end
 *     || case when is_nullable='YES' then '?' else '' end, ',' order by ordinal_position)
 *   from information_schema.columns where table_schema='public' group by table_name;
 *
 * USO
 *   pnpm build && pnpm test:paginas
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('No hay dist/index.html. Ejecuta "pnpm build" antes que esto.');
  process.exit(1);
}

const PUERTO = 4291;
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  let f = path.join(DIST, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  const tipos = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
    '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon' };
  s.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PUERTO, r));

const UID = '00000000-0000-4000-8000-0000000000ff';
const ID = i => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
const HOY = new Date().toISOString();

// t=texto i=entero b=booleano j=json d=fecha n=numerico a=array ; '?' = admite NULL
const ESQUEMA = {
 budgets:"id=t,user_id=t,client_id=t,description=t,items=j?,amount_cents=i?,status=t?,created_at=d?",
 clients:"id=t,user_id=t,name=t,company=t?,email=t?,phone=t?,payment_method_on_file=b?,stripe_customer_id=t?,created_at=d?,updated_at=d?,portal_user_id=t?,tax_id=t?,address=t?",
 contracts:"id=t,user_id=t,client_id=t,project_id=t,content=t,status=t?,signed_by=t?,signed_at=d?,expires_at=d?,signature=t?,created_at=d?",
 expenses:"id=t,user_id=t,description=t,amount_cents=i,tax_percent=n?,date=d,category=t?,project_id=t?,created_at=d?",
 invoices:"id=t,user_id=t,invoice_number=t,client_id=t,project_id=t?,issue_date=d,due_date=d,items=j,subtotal_cents=i,tax_percent=n?,total_cents=i,paid=b?,payment_date=d?,created_at=d?,irpf_percent=n?,notes=t?,budget_id=t?,contract_id=t?,fiscal_locked=b,rectifies_invoice_id=t?,is_rectified=b",
 jobs:"id=t,titulo=t,descripcioncorta=t?,descripcionlarga=t?,presupuesto=i,duracionsemanas=i,habilidades=a?,cliente=t?,fechapublicacion=d?,isfeatured=b?,compatibilidadia=i?,created_at=d?,email_contacto=t?,user_id=t",
 knowledge_articles:"id=t,user_id=t,title=t,content=t?,tags=a?,created_at=d?,updated_at=d?",
 projects:"id=t,user_id=t,client_id=t,name=t,description=t?,status=t?,start_date=d?,due_date=d?,budget_cents=i?,category=t?,priority=t?,created_at=d?",
 proposals:"id=t,user_id=t,client_id=t,title=t,content=t?,amount_cents=i?,status=t?,created_at=d?,items=j?,valid_until=d?",
 receipts:"id=t,user_id=t,client_id=t?,project_id=t?,receipt_number=t,concept=t,amount_cents=i,paid_at=d,method=t?,notes=t?,created_at=d",
 recurring_expenses:"id=t,user_id=t,description=t,amount_cents=i,category=t?,frequency=t,start_date=d,next_due_date=d?,created_at=d?,next_date=d?",
 recurring_invoices:"id=t,user_id=t,client_id=t,project_id=t?,items=j,tax_percent=n?,frequency=t,start_date=d,next_due_date=d?,created_at=d?",
 tasks:"id=t,user_id=t,project_id=t,description=t,status=t?,invoice_id=t?,created_at=d?",
 team_members:"id=t,user_id=t,name=t,email=t,role=t,status=t,invited_on=d?,hourly_rate_cents=i?,created_at=d?,accepted_user_id=t?",
 time_entries:"id=t,user_id=t,project_id=t,description=t?,start_time=d,end_time=d?,duration_seconds=i,invoice_id=t?,created_at=d?,logged_by=t?",
 fiscal_records:"id=t,user_id=t,invoice_id=t,record_type=t,nif_emisor=t,nombre_emisor=t,numero_factura=t,fecha_expedicion=d,tipo_factura=t,importe_total_cents=i,hash_anterior=t?,hash=t,hash_input=t,modalidad=t,estado_envio=t,created_at=d",
 job_applications:"id=t,job_id=t,applicant_id=t,status=t?,created_at=d?",
};

const PERFIL = { id:UID, user_id:UID, full_name:'Ana', email:'prueba@ejemplo.com', plan:'Pro',
  role:'admin', ai_credits:100, business_name:'Empresa', tax_id:'00000000T', pdf_color:'#F000B8',
  veri_factu_enabled:true, veri_factu_modality:'no_verifactu', signature_credits:5,
  profitability_alerts_enabled:false, skills:[], email_notifications:{} };

const RUTAS = ['/','/clients','/projects','/invoices','/receipts','/fiscal','/bank-reconciliation',
'/invoices/create','/expenses','/budgets','/proposals','/contracts','/template-marketplace',
'/time-tracking','/reports','/reports/profitability','/tax-ledger','/ai-assistant','/job-market',
'/post-job','/my-job-posts','/public-profile','/my-applications','/saved-jobs','/team',
'/knowledge-base','/inbox','/roles','/integrations','/forecasting','/affiliate','/billing',
'/portal-branding','/settings','/admin'];

const RUIDO = /DevTools|Download the React|runtime\.lastError|preloaded using link|WebSocket|ERR_TUNNEL|Failed to load resource/i;

function generarFilas(tabla, modo) {
  const def = ESQUEMA[tabla];
  if (!def) return [];
  const valor = (col, tipo, admiteNulo, i) => {
    if (admiteNulo && modo === 'nulos') return null;
    if (['user_id','logged_by','applicant_id','accepted_user_id','portal_user_id'].includes(col)) return UID;
    if (col === 'id') return ID(i);
    if (col.endsWith('_id')) return ID(1);
    switch (tipo) {
      case 'i': return 100 * i;
      case 'n': return 21;
      case 'b': return false;
      case 'd': return HOY;
      case 'a': return ['uno','dos'];
      case 'j': return [{ description:'Linea ' + i, quantity:1, price_cents:1000 }];
      default:
        if (col === 'status') return 'active';
        if (col === 'frequency') return 'monthly';
        if (col === 'modalidad') return 'no_verifactu';
        if (col === 'estado_envio') return 'no_aplica';
        if (col === 'record_type') return 'alta';
        if (col === 'email') return 'c' + i + '@ejemplo.com';
        return col + ' ' + i;
    }
  };
  return [1,2,3].map(i => Object.fromEntries(def.split(',').map(par => {
    const [col, marca] = par.split('=');
    return [col, valor(col, marca[0], marca.endsWith('?'), i)];
  })));
}

async function pasada(navegador, modo) {
  const pg = await (await navegador.newContext({ viewport:{ width:1360, height:900 } })).newPage();
  const caducidad = Math.floor(Date.now()/1000) + 3600;
  const jwt = p => [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
                    Buffer.from(JSON.stringify(p)).toString('base64url'), 'f'].join('.');
  const sesion = { access_token: jwt({ sub:UID, role:'authenticated', exp:caducidad, email:PERFIL.email }),
    token_type:'bearer', expires_in:3600, expires_at:caducidad, refresh_token:'rt',
    user:{ id:UID, aud:'authenticated', role:'authenticated', email:PERFIL.email,
           app_metadata:{}, user_metadata:{}, created_at:HOY } };

  await pg.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify(r.request().url().includes('/user') ? sesion.user : sesion) }));
  await pg.route('**/rest/v1/**', r => {
    const tabla = new URL(r.request().url()).pathname.split('/rest/v1/')[1]?.split('?')[0] || '';
    const unico = (r.request().headers()['accept'] || '').includes('pgrst.object');
    const datos = tabla.includes('profile') ? [PERFIL] : generarFilas(tabla, modo);
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'content-range': `0-${Math.max(datos.length-1,0)}/${datos.length}` },
      body: unico ? JSON.stringify(datos[0] ?? null) : JSON.stringify(datos) });
  });
  await pg.route('**/functions/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));

  let ruta = '(arranque)';
  const fallos = [];
  pg.on('console', m => { if (m.type() !== 'error') return;
    const t = m.text(); if (!RUIDO.test(t)) fallos.push({ ruta, texto: t.slice(0,200) }); });
  pg.on('pageerror', e => fallos.push({ ruta, texto: 'EXCEPCION: ' + String(e).slice(0,200) }));

  await pg.goto(`http://localhost:${PUERTO}/auth/login`, { waitUntil:'load' });
  await pg.waitForTimeout(1000);
  const aceptar = pg.getByRole('button', { name:/Aceptar/i }).first();
  if (await aceptar.count()) { await aceptar.click(); await pg.waitForTimeout(200); }
  await pg.fill('#login-email', PERFIL.email);
  await pg.fill('#login-password', 'loquesea');
  await pg.getByRole('button', { name:/^Entrar$/ }).click();
  await pg.waitForTimeout(2500);

  const rotas = [];
  for (const r of RUTAS) {
    ruta = r;
    const antes = fallos.length;
    try {
      await pg.goto(`http://localhost:${PUERTO}${r}`, { waitUntil:'load', timeout:20000 });
      await pg.waitForTimeout(1400);
      const info = await pg.evaluate(() => {
        const raiz = document.getElementById('root');
        const txt = (document.body.innerText || '').trim();
        return { n: raiz ? raiz.innerText.trim().length : 0, err: txt.includes('Algo salió mal') };
      });
      if (info.err || info.n < 40 || fallos.length > antes) rotas.push(r);
    } catch (e) {
      fallos.push({ ruta:r, texto:'no cargo: ' + String(e).slice(0,120) });
      rotas.push(r);
    }
  }
  await pg.context().close();
  return { rotas, fallos };
}

// Paginas sin sesion y el texto que DEBEN mostrar. Una expresion regular por
// si la pagina tiene varios estados validos (reset-password sin enlace de
// recuperacion dice "Enlace no válido", y eso es correcto).
const FACTURA_PUBLICA = ID(1);
const PUBLICAS = {
  '/auth/login':                         /Bienvenido de vuelta/,
  '/auth/register':                      /Crear cuenta/,
  '/auth/forgot-password':               /¿Olvidaste tu contraseña\?/,
  '/auth/reset-password':                /Enlace no válido|Elige una nueva contraseña/,
  '/portal/login':                       /Acceso al Portal/,
  '/portal/login?email=c@ejemplo.com':   /Acceso al Portal/,
  '/portal/dashboard':                   /Acceso al Portal/,   // sin sesion, al login
  '/privacy':                            /Política de Privacidad/,
  '/terms':                              /Términos del Servicio/,
  '/pricing':                            /Precios Transparentes/,
  [`/pay/${FACTURA_PUBLICA}`]:           /Factura F-PRUEBA-1/,
};

// Lo que devuelve get-public-invoice en produccion (ver la funcion: nunca
// manda business_name vacio). Sin esto la pagina de pago recibe {} y revienta
// por un dato que la funcion real siempre pone.
const RESPUESTA_FACTURA_PUBLICA = {
  id: FACTURA_PUBLICA, invoice_number: 'F-PRUEBA-1', issue_date: HOY, due_date: HOY,
  items: [{ description: 'Desarrollo', quantity: 1, price_cents: 10000 }],
  subtotal_cents: 10000, tax_percent: 21, total_cents: 12100, paid: false,
  paid_cents: 0, remaining_cents: 12100, business_name: 'Estudio de prueba',
  brand_color: null, client_name: 'Cliente de prueba',
};

async function pasadaPublica(navegador) {
  const pg = await (await navegador.newContext({ viewport:{ width:1280, height:900 } })).newPage();
  await pg.route('**/auth/v1/**', r => r.fulfill({ status:401, contentType:'application/json',
    body: JSON.stringify({ code:'no_session', message:'sin sesion' }) }));
  await pg.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  await pg.route('**/functions/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: r.request().url().includes('get-public-invoice') ? JSON.stringify(RESPUESTA_FACTURA_PUBLICA) : '{}' }));

  let ruta = '(arranque)';
  const fallos = [];
  pg.on('console', m => { if (m.type() !== 'error') return;
    const t = m.text(); if (!RUIDO.test(t)) fallos.push({ ruta, texto: t.slice(0,200) }); });
  pg.on('pageerror', e => fallos.push({ ruta, texto: 'EXCEPCION: ' + String(e).slice(0,200) }));

  await pg.goto(`http://localhost:${PUERTO}/auth/login`, { waitUntil:'load' });
  await pg.waitForTimeout(1000);
  const aceptar = pg.getByRole('button', { name:/Aceptar/i }).first();
  if (await aceptar.count()) { await aceptar.click(); await pg.waitForTimeout(200); }

  const rotas = [];
  for (const [r, esperado] of Object.entries(PUBLICAS)) {
    ruta = r;
    const antes = fallos.length;
    try {
      await pg.goto(`http://localhost:${PUERTO}${r}`, { waitUntil:'load', timeout:20000 });
      await pg.waitForTimeout(1400);
      const texto = await pg.evaluate(() => document.getElementById('root')?.innerText || '');
      if (!esperado.test(texto)) {
        fallos.push({ ruta:r, texto:`no aparece ${esperado} — se ve: "${texto.replace(/\s+/g,' ').trim().slice(0,80)}"` });
      }
      if (!esperado.test(texto) || fallos.length > antes) rotas.push(r);
    } catch (e) {
      fallos.push({ ruta:r, texto:'no cargo: ' + String(e).slice(0,120) });
      rotas.push(r);
    }
  }
  await pg.context().close();
  return { rotas, fallos };
}

// CHROMIUM_PARA_PRUEBAS permite apuntar a un Chromium ya instalado en el
// sistema. Sin esa variable usa el que descarga Playwright, que es lo que
// pasa en CI (paso "playwright install chromium").
const navegador = await chromium.launch(
  process.env.CHROMIUM_PARA_PRUEBAS ? { executablePath: process.env.CHROMIUM_PARA_PRUEBAS } : {}
);
let totalRotas = 0;

for (const modo of ['lleno','nulos']) {
  const { rotas, fallos } = await pasada(navegador, modo);
  totalRotas += rotas.length;
  if (rotas.length === 0) {
    console.log(`[${modo}] OK — las ${RUTAS.length} paginas se pintan sin errores.`);
  } else {
    console.log(`[${modo}] ${rotas.length} de ${RUTAS.length} con problemas: ${rotas.join(', ')}`);
    const porRuta = {};
    for (const f of fallos) (porRuta[f.ruta] ||= new Set()).add(f.texto);
    for (const [k, v] of Object.entries(porRuta)) for (const t of v) console.log(`    ${k} :: ${t}`);
  }
}

{
  const { rotas, fallos } = await pasadaPublica(navegador);
  const total = Object.keys(PUBLICAS).length;
  totalRotas += rotas.length;
  if (rotas.length === 0) {
    console.log(`[publicas] OK — las ${total} paginas sin sesion enseñan lo que deben.`);
  } else {
    console.log(`[publicas] ${rotas.length} de ${total} con problemas: ${rotas.join(', ')}`);
    for (const f of fallos) console.log(`    ${f.ruta} :: ${f.texto}`);
  }
}

await navegador.close();
srv.close();
process.exit(totalRotas === 0 ? 0 : 1);
