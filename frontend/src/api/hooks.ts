import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Assembly, FlatPart, HotFlag, HotFlagStatus, ImportBatch, ImportRow, OperationConstraint, Part } from './types'

export function useAssemblies(filters?: { project?: string; portfolio?: string }) {
  const params = new URLSearchParams()
  if (filters?.project) params.set('project', filters.project)
  if (filters?.portfolio) params.set('portfolio', filters.portfolio)
  const qs = params.toString()
  return useQuery({
    queryKey: ['assemblies', filters?.project ?? null, filters?.portfolio ?? null],
    queryFn: () => api.get<Assembly[]>(`/assemblies${qs ? `?${qs}` : ''}`),
    refetchInterval: 30_000,
  })
}

export function useAssembly(assemblyId: string | undefined) {
  return useQuery({
    queryKey: ['assemblies', 'detail', assemblyId],
    queryFn: () => api.get<Assembly>(`/assemblies/${assemblyId}`),
    enabled: !!assemblyId,
  })
}

/** Every part anywhere under this assembly, at any depth, flattened into one list. */
export function useAssemblyFlatten(assemblyId: string | undefined) {
  return useQuery({
    queryKey: ['assemblies', 'detail', assemblyId, 'flatten'],
    queryFn: () => api.get<FlatPart[]>(`/assemblies/${assemblyId}/flatten`),
    enabled: !!assemblyId,
  })
}

export function useCreateAssembly() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; parent_assembly_id?: string; project?: string; portfolio?: string; due_date?: string }) =>
      api.post<Assembly>('/assemblies', data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['assemblies'] })
      if (variables.parent_assembly_id) {
        qc.invalidateQueries({ queryKey: ['assemblies', 'detail', variables.parent_assembly_id] })
      }
    },
  })
}

export function usePortfolios() {
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: () => api.get<string[]>('/portfolios'),
  })
}

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

export function useConstraints(project?: string) {
  return useQuery({
    queryKey: ['constraints', project ?? null],
    queryFn: () => api.get<OperationConstraint[]>(`/constraints${project ? `?project=${encodeURIComponent(project)}` : ''}`),
    refetchInterval: 30_000,
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
    qc.invalidateQueries({ queryKey: ['assemblies'] })
    qc.invalidateQueries({ queryKey: ['import-batches'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['portfolios'] })
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
