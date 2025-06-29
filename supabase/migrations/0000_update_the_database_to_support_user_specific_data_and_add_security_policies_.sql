-- Add a column to link saved states to a user
ALTER TABLE public.calculator_state
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add a unique constraint to ensure each user has only one saved state
CREATE UNIQUE INDEX IF NOT EXISTS calculator_state_user_id_idx ON public.calculator_state(user_id);

-- Remove old policies that allowed public access
DROP POLICY IF EXISTS "Allow public insert" ON public.calculator_state;
DROP POLICY IF EXISTS "Allow public read access" ON public.calculator_state;
DROP POLICY IF EXISTS "Allow public update" ON public.calculator_state;

-- Enable Row Level Security
ALTER TABLE public.calculator_state ENABLE ROW LEVEL SECURITY;

-- Add new policies to ensure users can only access their own data
CREATE POLICY "Users can read their own calculator state."
ON public.calculator_state FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calculator state."
ON public.calculator_state FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calculator state."
ON public.calculator_state FOR UPDATE
USING (auth.uid() = user_id);