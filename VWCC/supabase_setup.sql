-- Clarification: project_id is the table primary key.
-- user_id is generated from the authenticated user for each inserted row.
ALTER TABLE public."VWCC Data"
ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Existing rows must have user_id assigned before strict RLS is useful.
-- UPDATE public."VWCC Data" SET user_id = auth.uid() WHERE user_id IS NULL;
-- DELETE FROM public."VWCC Data" WHERE user_id IS NULL;

-- Enable row-level security on the project table.
ALTER TABLE public."VWCC Data" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated browser clients to use the table operations the app performs.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public."VWCC Data"
TO authenticated;

-- Replace the setup policy cleanly if this script is run more than once.
DROP POLICY IF EXISTS "Users manage own VWCC projects" ON public."VWCC Data";

-- Let one signed-in account read and change only rows that belong to that account.
CREATE POLICY "Users manage own VWCC projects"
ON public."VWCC Data"
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);
