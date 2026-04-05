import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useIsPro() {
  return useQuery({
    queryKey: ['entitlements', 'pro'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return false
      const { data } = await supabase
        .from('user_entitlements')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('entitlement', 'pro')
        .eq('is_active', true)
        .maybeSingle()
      return !!data
    },
  })
}
