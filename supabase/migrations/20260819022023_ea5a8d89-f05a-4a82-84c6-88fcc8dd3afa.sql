REVOKE EXECUTE ON FUNCTION public.get_published_analysis_for_parent_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_published_analysis_for_parent_token(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_analysis_for_parent_token(text) TO service_role;