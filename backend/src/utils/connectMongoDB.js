import mongoose from 'mongoose'
import { configureDnsServers } from './dnsConfig.js'

export async function connectMongoDB(uri) {
  configureDnsServers()
  return mongoose.connect(uri)
}
