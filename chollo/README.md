# Chollo Vuelos: puesta en marcha

Tres piezas: **web** (la app), **Supabase** (cuentas + base de datos) y **worker** (revisa precios y manda correos cada 30 min con GitHub Actions).

## 1. Supabase (cuentas y datos)
1. Crea un proyecto en supabase.com (plan gratis).
2. SQL Editor → pega `supabase/schema.sql` → Run.
3. Authentication → URL Configuration → pon en *Site URL* la dirección donde publicarás la web (paso 4).
4. Settings → API: copia **Project URL**, **anon key** y **service_role key** (esta última es secreta: nunca en la web).

## 2. Resend (correos)
1. Crea cuenta en resend.com → API Keys → crea una.
2. Sin dominio propio solo puedes mandar desde `onboarding@resend.dev` y **solo a tu propio correo** (vale para probar). Para avisar a otras personas hay que verificar un dominio en Resend.

## 3. GitHub (revisión automática)
1. Sube esta carpeta a un repositorio de GitHub.
2. Settings → Secrets and variables → Actions → crea los secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`. En *Variables* crea `PROVIDER` = `mock`.
3. Pestaña Actions → "Revisar precios" → Run workflow para probar.

## 4. Web
1. Abre `web/index.html` y pega tu Project URL y tu anon key arriba del script.
2. Publica la carpeta `web` en Netlify, Cloudflare Pages o GitHub Pages (gratis).

## Probar todo con datos falsos
1. Entra en la web con tu correo, crea una alerta (por ejemplo BCN → Cualquier lugar, 200 €, −20 %).
2. En tu ordenador: `cd worker && npm install`, define `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, y ejecuta `node check.js --seed` (crea histórico falso). Después lanza el workflow de GitHub o `node check.js`.
3. Cuando el precio inventado baje lo suficiente, te llega el correo.

## Pendiente para que sea real
- **Proveedor de vuelos real:** implementar `fetchOffers` en `worker/check.js` con la API elegida (`PROVIDER` distinto de `mock`).
- El "habitual" es la mediana de 90 días de la ruta: mejora cuando haya semanas de datos.
- Verificar dominio en Resend, política de privacidad y enlace para darse de baja (RGPD) antes de abrirla al público.
- Portar a esta versión el resto del diseño (Buscar, Perfil, filtros, "Sorpréndeme").
