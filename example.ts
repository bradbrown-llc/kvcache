import { KvCache, Fallbacks, KvCacheSetter } from './mod.ts'

const kv = await Deno.openKv()

const fallbacks:Fallbacks<number> = { value: 250, expireIn: 2500 }
const c_delay = new KvCache(kv, ['path0', 'path1'], fallbacks)

;(async () => {
    for await (const message of c_delay.info) {
        console.log(message)
    }
})()

;(async () => {
    for await (const error of c_delay.errors) {
        console.log(`${Date.now()} some KvCache failure`)
        console.error(error)
    }
})()

kv.delete(c_delay.key)

setInterval(() => {
    const setter:KvCacheSetter<typeof c_delay> = { value: Math.random() * 1000 }
    // c_delay.set(setter)
    kv.set(c_delay.key, { ...c_delay.fallbacks, ...setter })
}, 1000)

let i = 0
while (true) {
    console.log(Date.now(), 'loop', i++)
    const delay = await c_delay.get()
    await new Promise(r => setTimeout(r, delay))
}