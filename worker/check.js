// Revisa precios, detecta chollos y manda los correos. Uso: node check.js [--seed]
import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, MAIL_FROM = "onboarding@resend.dev", PROVIDER = "mock" } = process.env;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const ANY = (process.env.ANY_DESTS || "MXP,FCO,CDG,LHR,LIS,BER,AMS,BRU").split(",");
const seed = process.argv.includes("--seed");
const day = (t) => new Date(t).toISOString().slice(0, 10);

// ---- Proveedor de precios: aquí se conecta la API real ----
// Debe devolver [{origin,dest,dep_date,ret_date|null,price,airline,link}]
function mockOffers(o, d, n, normal) {
  const base = 60 + ([...o + d].reduce((a, c) => a + c.charCodeAt(0), 0) % 90);
  return Array.from({ length: n }, (_, i) => {
    const dep = Date.now() + (14 + i * 9) * 864e5;
    const f = normal || Math.random() > 0.25 ? 0.85 + Math.random() * 0.3 : 0.3 + Math.random() * 0.4;
    return { origin: o, dest: d, dep_date: day(dep), ret_date: day(dep + 4 * 864e5), price: Math.round(base * f), airline: "Demo Air", link: "https://example.com" };
  });
}
async function fetchOffers(o, d) {
  if (PROVIDER === "mock") return mockOffers(o, d, 3);
  throw new Error(`Proveedor "${PROVIDER}" sin implementar: añade aquí la llamada a su API`);
}

async function mail(to, p, usual, pct) {
  const ex = pct >= 75, save = Math.round(usual - p.price);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;border:1px solid #cfdae5;border-radius:16px;padding:20px;text-align:center">
<b>${ex ? "🚨 PRECIO EXCEPCIONAL" : "✈️ ¡Vuelo barato encontrado!"}</b><h2>${p.origin} → ${p.dest}</h2>
<div style="font-size:52px;font-weight:800">${p.price} €</div>
<div style="color:#d7263d;text-decoration:line-through;font-size:20px">${Math.round(usual)} €</div>
<p style="color:#0e8a5f;font-weight:700">−${pct} % · Ahorras ${save} €</p>
<p>📅 ${p.dep_date}${p.ret_date ? " → " + p.ret_date : ""} · ${p.airline || ""}</p>
<a href="${p.link}" style="display:inline-block;background:#0b1f33;color:#ffc933;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Ver vuelo</a>
<p style="color:#5c6f82;font-size:12px">Los precios cambian rápido: compruébalo en la web del proveedor.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to, subject: `${ex ? "🚨" : "✈️"} ${p.origin} → ${p.dest} por ${p.price} € (−${pct} %)`, html }),
  });
  if (!r.ok) console.error("Resend:", await r.text());
  return r.ok;
}

const { data: alerts, error } = await db.from("alerts").select("*").eq("active", true);
if (error) throw error;
const routes = new Map();
for (const a of alerts) for (const d of a.dest === "ANY" ? ANY : [a.dest]) routes.set(a.origin + d, [a.origin, d]);
console.log(`${alerts.length} alertas, ${routes.size} rutas`);

const found = {};
for (const [k, [o, d]] of routes) {
  if (seed) { // histórico falso de 60 días para que exista "precio habitual"
    const rows = Array.from({ length: 30 }, () => ({ ...mockOffers(o, d, 1, true)[0], seen_at: new Date(Date.now() - Math.random() * 60 * 864e5).toISOString() }));
    await db.from("prices").insert(rows); continue;
  }
  try { found[k] = await fetchOffers(o, d); await db.from("prices").insert(found[k]); }
  catch (e) { console.error(k, e.message); }
}
if (seed) { console.log("Histórico de prueba creado"); process.exit(0); }

const { data: us } = await db.from("usual_prices").select("*");
const U = Object.fromEntries(us.map((u) => [u.origin + u.dest, +u.usual]));
for (const a of alerts) {
  let best = null;
  for (const d of a.dest === "ANY" ? ANY : [a.dest]) for (const p of found[a.origin + d] || []) {
    const usual = U[a.origin + d]; if (!usual) continue;
    const pct = Math.round(((usual - p.price) / usual) * 100);
    const okTrip = a.trip === "any" || (a.trip === "rt") === !!p.ret_date;
    if (okTrip && p.price <= a.max_price && pct >= a.min_discount && (!best || pct > best.pct)) best = { p, usual, pct };
  }
  if (!best) continue;
  const key = { alert_id: a.id, origin: best.p.origin, dest: best.p.dest, dep_date: best.p.dep_date, price: best.p.price };
  const { error: dup } = await db.from("sent").insert(key);
  if (dup) continue; // ya avisado
  const { data: u } = await db.auth.admin.getUserById(a.user_id);
  const ok = u?.user?.email && (await mail(u.user.email, best.p, best.usual, best.pct));
  if (!ok) await db.from("sent").delete().match(key); // reintentar en la próxima vuelta
  else console.log("Aviso enviado", best.p.origin, best.p.dest, best.p.price);
}
