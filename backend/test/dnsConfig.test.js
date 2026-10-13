import assert from 'node:assert/strict'
import dns from 'node:dns'
import { after, test } from 'node:test'
import { configureDnsServers } from '../src/utils/dnsConfig.js'

const originalServers = dns.getServers()

after(() => {
  dns.setServers(originalServers)
})

test('conserve le DNS système lorsque DNS_SERVERS est absent ou vide', () => {
  const currentServers = dns.getServers()
  assert.equal(configureDnsServers(''), false)
  assert.deepEqual(dns.getServers(), currentServers)
  assert.equal(configureDnsServers('   '), false)
  assert.deepEqual(dns.getServers(), currentServers)
})

test('configure plusieurs serveurs DNS IPv4/IPv6 avant les connexions', () => {
  assert.equal(configureDnsServers('8.8.8.8, 2001:4860:4860::8888'), true)
  assert.deepEqual(dns.getServers(), ['8.8.8.8', '2001:4860:4860::8888'])
})

test('refuse les adresses DNS invalides au lieu de les ignorer', () => {
  const currentServers = dns.getServers()
  assert.throws(
    () => configureDnsServers('8.8.8.8,invalid-dns'),
    /DNS_SERVERS doit contenir/,
  )
  assert.deepEqual(dns.getServers(), currentServers)
})
