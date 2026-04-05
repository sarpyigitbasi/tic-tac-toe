import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  type CreateSubscriptionInput,
  type Subscription,
} from '@subtrackr/core'

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .in('status', ['active', 'paused'])
        .order('amount', { ascending: false }) // D-02: highest cost first
      if (error) throw error
      return data as Subscription[]
    },
  })
}

export function useSubscriptionCount() {
  // For usage counter (D-07)
  return useQuery({
    queryKey: ['subscriptions', 'count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .in('status', ['active', 'paused'])
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useAddSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateSubscriptionInput) => {
      const validated = createSubscriptionSchema.parse(input)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          ...validated,
          user_id: user.id,
          source: 'manual',
          confirmed_by_user: true,
          normalized_name: validated.service_name.toLowerCase().replace(/\s+/g, '_'),
        })
        .select()
        .single()
      if (error) {
        if (error.message?.includes('FREE_TIER_LIMIT_REACHED')) {
          throw new Error('FREE_TIER_LIMIT_REACHED')
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Record<string, unknown>) => {
      const validated = updateSubscriptionSchema.parse(input)
      const { data, error } = await supabase
        .from('subscriptions')
        .update(validated)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subscriptions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}

export function useArchiveSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}
