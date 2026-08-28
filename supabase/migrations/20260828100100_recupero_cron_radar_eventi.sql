-- Brief "Riportare in git ciò che vive solo nel database" (28/8/2026),
-- Passo 4: ciò che il diff non vede. cron.job non è nello schema public,
-- quindi non compare in nessuna introspezione su public — va scritto a
-- mano. Idempotente: cron.unschedule dentro un blocco che tollera
-- l'assenza del lavoro, poi cron.schedule. Le pianificazioni sono quelle
-- già attive in produzione, trascritte senza cambiarle.

do $$ begin perform cron.unschedule('radar-eventi-harvest'); exception when others then null; end $$;
select cron.schedule('radar-eventi-harvest', '20 3 * * *',
  $$select public.lancia_radar_eventi(p_esegui => true);$$);

do $$ begin perform cron.unschedule('radar-eventi-classifica'); exception when others then null; end $$;
select cron.schedule('radar-eventi-classifica', '40 3 * * *',
  $$select public.lancia_radar_classifica(p_esegui => true);$$);

do $$ begin perform cron.unschedule('radar-eventi-classifica-coda'); exception when others then null; end $$;
select cron.schedule('radar-eventi-classifica-coda', '10 4 * * *',
  $$select public.lancia_radar_classifica(p_esegui => true);$$);

do $$ begin perform cron.unschedule('radar-eventi-digest'); exception when others then null; end $$;
select cron.schedule('radar-eventi-digest', '30 7 * * 1',
  $$select public.lancia_radar_classifica(p_esegui => true, p_digest => true);$$);

do $$ begin perform cron.unschedule('radar-eventi-battito'); exception when others then null; end $$;
select cron.schedule('radar-eventi-battito', '15 8 * * 1',
  $$select public.controlla_radar_eventi();$$);
