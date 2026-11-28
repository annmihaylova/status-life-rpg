-- Своя 3D-модель (фаза 4b): приватный бакет vrm-user, файлы лежат в папке <user_id>/.
-- Пользователь читает, кладёт и удаляет только свои файлы; размер до 30 МБ.
insert into storage.buckets (id, name, public, file_size_limit)
values ('vrm-user', 'vrm-user', false, 31457280)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
--> statement-breakpoint
create policy "vrm_user_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'vrm-user' and (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
create policy "vrm_user_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'vrm-user' and (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
create policy "vrm_user_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'vrm-user' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'vrm-user' and (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
create policy "vrm_user_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'vrm-user' and (storage.foldername(name))[1] = (select auth.uid())::text);
