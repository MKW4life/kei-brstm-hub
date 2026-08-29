-- 既存の tracks.loop_type を新しい2分類へ寄せる任意SQLです。
-- すでに統一済みなら実行不要です。

update public.tracks
set loop_type = 'loop'
where loop_type in ('perfect_loop', 'loop');

update public.tracks
set loop_type = 'no'
where loop_type in ('bad_loop', 'no_loop', 'no');
