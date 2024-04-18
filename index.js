// @ts-check
import { createController } from 'ipfsd-ctl'
import { path as kuboPath } from 'kubo'
import * as kuboRpcClient from 'kubo-rpc-client'
import loadFixture from 'aegir/fixtures'
import drain from 'it-drain'
import { CID } from 'multiformats/cid'

async function loadFixtureDataCar (controller, path) {
  const fixtureData = `${path}`
  const buf = loadFixture(fixtureData)
  await drain(controller.api.dag.import([buf]))
}

async function createKuboNode () {
  return createController({
    kuboRpcModule: kuboRpcClient,
    ipfsBin: kuboPath(),
    // test: true,
    ipfsOptions: {
      config: {
        Addresses: {
          Swarm: [
            '/ip4/0.0.0.0/tcp/4001',
            '/ip4/0.0.0.0/tcp/4002/ws'
          ],
          Gateway: '/ip4/127.0.0.1/tcp/8180'
        },
        Gateway: {
          NoFetch: true,
          ExposeRoutingAPI: true,
          HTTPHeaders: {
            'Access-Control-Allow-Origin': ['*'],
            'Access-Control-Allow-Methods': ['GET', 'POST', 'PUT', 'OPTIONS']
          }
        }
      }
    },
    args: ['--enable-pubsub-experiment', '--enable-namesys-pubsub']
  })
}

const kuboNode = await createKuboNode()
// try {
//   await kuboNode.init()
// } catch {
//   // ignore
// }
await kuboNode.start()
console.log('started kubo node')
// log kubo node peerId
const kuboNodePeerId = (await kuboNode.api.id()).id.toString()
console.log('peerId:', kuboNodePeerId)
await loadFixtureDataCar(kuboNode, 'gateway-conformance-fixtures.car')
console.log('loaded gateway conformance fixtures')

// now try to call routing endpoint
const resp = await fetch(`http://${kuboNode.api.gatewayHost}:${kuboNode.api.gatewayPort}/routing/v1/providers/bafybeifq2rzpqnqrsdupncmkmhs3ckxxjhuvdcbvydkgvch3ms24k5lo7q`)
const routingProviders = (await resp.json()).Providers.map(p => p.ID)

console.log('routing/v1 providers: ', routingProviders)

// list providers via kuboNode.api.routing.findProviders
const dhtProviders = []
try {
  for await (const provs of kuboNode.api.dht.findProvs(CID.parse('bafybeifq2rzpqnqrsdupncmkmhs3ckxxjhuvdcbvydkgvch3ms24k5lo7q'), {signal: AbortSignal.timeout(2000)})) {
    if (provs.providers != null) {
      dhtProviders.push(...provs.providers.map(p => p.id.toString()))
    }
  }
} catch {
  // ignore
} finally {
  console.log('dht providers: ', dhtProviders)
}

console.log('routingProviders includes local node? ', routingProviders.includes(kuboNodePeerId))
console.log('dhtProviders includes local node? ', dhtProviders.includes(kuboNodePeerId))
await kuboNode.stop()
