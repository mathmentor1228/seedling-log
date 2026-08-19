REVOKE EXECUTE ON FUNCTION public.can_view_team_note(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_team_note(uuid) TO authenticated, service_role;