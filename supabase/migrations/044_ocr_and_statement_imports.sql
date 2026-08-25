-- ============================================================================
-- 044: OCR & Statement Ingestion Support in Imports
--      Expands the imports source constraint to record AI OCR Ingestion,
--      Bank Statement scans, and multi-record OCR audits.
-- ============================================================================

-- Drop check constraint if present and recreate with expanded sources
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'imports_source_check'
      and conrelid = 'public.imports'::regclass
  ) then
    alter table public.imports drop constraint imports_source_check;
  end if;
end $$;

alter table public.imports
  add constraint imports_source_check
  check (source in ('Excel Import', 'CSV Import', 'AI OCR Ingestion', 'Bank Statement OCR', 'Invoice OCR', 'Manual Text OCR'));
