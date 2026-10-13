import dns from 'node:dns'
import { isIP } from 'node:net'

export function configureDnsServers(value = process.env.DNS_SERVERS) {
  if (value === undefined || value === '') return false
  if (typeof value !== 'string') {
    throw new Error('DNS_SERVERS doit être une chaîne d’adresses IP séparées par des virgules.')
  }
  if (value.trim() === '') return false

  const servers = value.split(',').map((server) => server.trim())
  if (servers.some((server) => !server || !isIP(server))) {
    throw new Error('DNS_SERVERS doit contenir une ou plusieurs adresses IP séparées par des virgules.')
  }

  dns.setServers(servers)
  return true
}
