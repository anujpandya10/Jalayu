-- Contact & address on profiles for Settings + AI context
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists address_line2 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists postal_code text;
alter table public.profiles add column if not exists country text default 'US';
