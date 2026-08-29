-- Loop分類を完全に2種類へ統一するSQL
-- Supabase SQL Editorで1回実行してください。

alter table public.tracks
drop constraint if exists tracks_loop_type_check;

update public.tracks
set loop_type = 'loop'
where loop_type in ('perfect_loop', 'loop');

update public.tracks
set loop_type = 'no'
where loop_type in ('bad_loop', 'no_loop', 'no');

alter table public.tracks
alter column loop_type set default 'loop';

alter table public.tracks
add constraint tracks_loop_type_check
check (loop_type in ('loop', 'no'));
