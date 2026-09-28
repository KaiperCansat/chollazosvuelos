-- Pega todo esto en Supabase > SQL Editor > Run

create table alerts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  origin text not null,
  dest text not null default 'ANY',
  max_price int not null,
  trip text not null default 'rt' check (trip in ('rt','ow','any')),
  min_discount int not null default 40,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table prices(
  id bigint generated always as identity primary key,
  origin text not null, dest text not null,
  dep_date date not null, ret_date date,
  price numeric not null, currency text not null default 'EUR',
  airline text, link text,
  seen_at timestamptz not null default now()
);
create index on prices(origin, dest, seen_at desc);

-- evita mandar dos veces el mismo aviso
create table sent(
  alert_id uuid references alerts on delete cascade,
  origin text, dest text, dep_date date, price numeric,
  sent_at timestamptz default now(),
  primary key(alert_id, origin, dest, dep_date, price)
);

alter table alerts enable row level security;
alter table prices enable row level security;
alter table sent   enable row level security;
create policy "mis alertas" on alerts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ver precios" on prices for select to authenticated using (true);
-- prices y sent solo las escribe el worker (service key, que se salta RLS)

-- precio habitual = mediana de los últimos 90 días (mínimo 5 datos)
create view usual_prices as
  select origin, dest, percentile_cont(0.5) within group (order by price) as usual, count(*) as n
  from prices where seen_at > now() - interval '90 days'
  group by origin, dest having count(*) >= 5;

-- ofertas actuales con su descuento
create view deals with (security_invoker = on) as
  select distinct on (p.origin, p.dest, p.dep_date, p.ret_date)
    p.*, u.usual, round((u.usual - p.price) / u.usual * 100) as pct
  from prices p join usual_prices u using (origin, dest)
  where p.seen_at > now() - interval '2 days'
  order by p.origin, p.dest, p.dep_date, p.ret_date, p.seen_at desc;
