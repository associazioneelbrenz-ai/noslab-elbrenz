-- Foto profilo dei soci (app): ognuno carica/aggiorna/elimina SOLO la propria,
-- nel prefisso avatar/{uid}/ del bucket pubblico assets-pubblici. L'URL va in
-- utente.avatar_url (aggiornabile via la policy utente_update_own gia' presente:
-- il socio modifica solo la propria riga). Applicata via MCP.
drop policy if exists assets_avatar_own_insert on storage.objects;
create policy assets_avatar_own_insert on storage.objects
  for insert to authenticated
  with check ( bucket_id='assets-pubblici' and (storage.foldername(name))[1]='avatar' and (storage.foldername(name))[2] = auth.uid()::text );

drop policy if exists assets_avatar_own_update on storage.objects;
create policy assets_avatar_own_update on storage.objects
  for update to authenticated
  using ( bucket_id='assets-pubblici' and (storage.foldername(name))[1]='avatar' and (storage.foldername(name))[2] = auth.uid()::text );

drop policy if exists assets_avatar_own_delete on storage.objects;
create policy assets_avatar_own_delete on storage.objects
  for delete to authenticated
  using ( bucket_id='assets-pubblici' and (storage.foldername(name))[1]='avatar' and (storage.foldername(name))[2] = auth.uid()::text );
