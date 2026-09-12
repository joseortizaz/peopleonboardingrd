-- =========================================================
-- Mensajes de contacto del portal publico (landing page)
-- =========================================================

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company text,
  phone text,
  message text not null,
  status text not null default 'nuevo' check (status in ('nuevo', 'atendido', 'descartado')),
  created_at timestamptz not null default now()
);

create index contact_messages_created_at_idx on public.contact_messages(created_at desc);

alter table public.contact_messages enable row level security;

-- Cualquiera (incluido publico anonimo) puede enviar un mensaje desde el
-- formulario de contacto de la landing page.
create policy contact_messages_insert_public on public.contact_messages
  for insert with check (true);

-- Solo el super admin puede leer/gestionar los mensajes recibidos.
create policy contact_messages_select_super_admin on public.contact_messages
  for select using (public.is_super_admin());

create policy contact_messages_update_super_admin on public.contact_messages
  for update using (public.is_super_admin());

create policy contact_messages_delete_super_admin on public.contact_messages
  for delete using (public.is_super_admin());
