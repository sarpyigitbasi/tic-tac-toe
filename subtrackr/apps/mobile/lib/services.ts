import servicesData from './services-data.json'

export interface ServiceInfo {
  key: string
  name: string
  default_amount: number | null
  default_frequency: string
  default_category: string
  icon: string
}

export function searchServices(query: string): ServiceInfo[] {
  if (!query || query.length < 2) return []
  const lower = query.toLowerCase()
  return (servicesData as ServiceInfo[])
    .filter((s: ServiceInfo) => s.name.toLowerCase().includes(lower))
    .slice(0, 5) // Max 5 suggestions per UI-SPEC
}

export function getServiceByKey(key: string): ServiceInfo | undefined {
  return (servicesData as ServiceInfo[]).find((s: ServiceInfo) => s.key === key)
}
