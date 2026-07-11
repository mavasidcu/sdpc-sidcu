import { trpc } from "@/lib/trpc";

export function useAuthState() {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  return {
    user: user ?? null,
    isAuthenticated: !!user,
    isLoading,
  };
}

export function useAuth() {
  const utils = trpc.useUtils();
  const state = useAuthState();
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const registerMutation = trpc.auth.register.useMutation();

  return {
    ...state,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
}
