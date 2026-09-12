import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { HotFlag, HotFlagStatus, ImportBatch, ImportRow, Part } from './types'

export function useParts(project?: string) {
  return useQuery({
    queryKey: ['parts', project ?? null],
    queryFn: () => api.get<Part[]>(`/parts${project ? `?project=${encodeURIComponent(project)}` : ''}`),
    refetchInterval: 30_000,
  })
}

export function usePart(partId: string | undefined) {
  return useQuery({
    queryKey: ['parts', 'detail', partId],
    queryFn: () => api.get<Part>(`/parts/${partId}`),
    enabled: !!partId,
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<string[]>('/projects'),
  })
}

export function useImportBatches() {
  return useQuery({
    queryKey: ['import-batches'],
    queryFn: () => api.get<ImportBatch[]>('/import-batches'),
    refetchInterval: 30_000,
  })
}

function useInvalidateParts() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['parts'] })
    qc.invalidateQueries({ queryKey: ['import-batches'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
  }
}

export function useImportExtract() {
  const invalidate = useInvalidateParts()
  return useMutation({
    mutationFn: (data: { source_label?: string; rows: ImportRow[] }) =>
      api.post<ImportBatch & { parts_created: number }>('/import', data),
    onSuccess: invalidate,
  })
}

export function useCreateHotFlag(partId: string) {
  const invalidate = useInvalidateParts()
  return useMutation({
    mutationFn: (data: { requested_by: string; reason: string }) =>
      api.post<HotFlag>(`/parts/${partId}/hot-flags`, data),
    onSuccess: invalidate,
  })
}

export function useUpdateHotFlag() {
  const invalidate = useInvalidateParts()
  return useMutation({
    mutationFn: ({ flagId, status, acknowledgedBy }: { flagId: string; status: HotFlagStatus; acknowledgedBy?: string }) =>
      api.put<HotFlag>(`/hot-flags/${flagId}`, { status, acknowledged_by: acknowledgedBy }),
    onSuccess: invalidate,
  })
}
