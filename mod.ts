import { AIQ } from 'https://deno.land/x/aiq@0.0.0/mod.ts'
import { Lazy } from 'https://deno.land/x/lazy_promise@0.0.1/mod.ts'
import { Gate } from 'https://deno.land/x/gate@0.0.0/mod.ts'
import { Snail } from 'https://deno.land/x/snail@0.0.0/mod.ts'

export type Fallbacks<T> = { value:T, expireIn:number }

export type KvCacheEntry<T> = { value:T, expireIn:number }

export type KvCacheSetter<T> = T extends KvCache<infer U> ? Partial<KvCacheEntry<U>> : never

export class KvCache<T> {

    fallbacks:Fallbacks<T>
    value?:T
    timestamp:number
    expireIn?:number
    key:Deno.KvKey
    gate:Gate<void>|null
    kv:Deno.Kv
    info:AIQ<string>
    errors:AIQ<Error>

    constructor(kv:Deno.Kv, key:Deno.KvKey, fallbacks:Fallbacks<T>) {
        this.kv = kv
        this.fallbacks = fallbacks
        this.timestamp = Date.now()
        this.key = key
        this.gate = null
        this.info = new AIQ<string>
        this.errors = new AIQ<Error>
    }
    
    async get() {

        const expireIn = this.expireIn ?? this.fallbacks.expireIn
        const elapsed = Date.now() - this.timestamp

        if (expireIn >= elapsed) return this.value ?? this.fallbacks.value

        if (this.gate) return this.value ?? this.fallbacks.value
        this.gate = new Gate()
        
        const lazy:Lazy<Deno.KvEntryMaybe<KvCacheEntry<T>>> = () => this.kv.get<KvCacheEntry<T>>(this.key)
        const snail = new Snail(lazy)
        snail.born
            .then(() => this.info.push(`${Date.now()} KvCache.get getting key [${this.key}]`))
        snail.died
            .then(value => this.info.push(`${Date.now()} KvCache.get got key [${this.key}], value ${JSON.stringify(value,(_,v)=>typeof v=='bigint'?''+v:v)}`))
            .catch(reason => this.errors.push(new Error(`${Date.now()} KvCache.get failed to retrieve key [${this.key}]`, { cause: reason })))
        const kvem = await snail.lazy().catch(() => {})
        if (this.gate === null) return this.value ?? this.fallbacks.value
        const cached = kvem?.value

        this.value = cached?.value ?? this.value ?? this.fallbacks.value
        this.expireIn = cached?.expireIn ?? this.expireIn ?? this.fallbacks.expireIn
        this.timestamp = Date.now()
        this.gate.resolve()
        this.gate = null

        return this.value

    }
    
    set(setter:KvCacheSetter<typeof this>) {

        if (!setter.value) setter.value = this.value ?? this.fallbacks.value
        if (!setter.expireIn) setter.expireIn = this.expireIn ?? this.fallbacks.expireIn
        this.value = setter.value
        this.expireIn = setter.expireIn
        this.timestamp = Date.now()

        const lazy:Lazy<Deno.KvCommitResult> = () => this.kv.set(this.key, setter)
        const snail = new Snail(lazy)
        snail.born
            .then(() => this.info.push(`${Date.now()} KvCache.set setting key [${this.key}] to value ${JSON.stringify(setter,(_,v)=>typeof v=='bigint'?''+v:v)}`))
        snail.died
            .then(() => this.info.push(`${Date.now()} KvCache.get set key [${this.key}] to value ${JSON.stringify(setter,(_,v)=>typeof v=='bigint'?''+v:v)}`))
            .catch(reason => this.errors.push(new Error(`${Date.now()} KvCache.set failed setting key [${this.key}] to value ${JSON.stringify(setter,(_,v)=>typeof v=='bigint'?''+v:v)}`, { cause: reason })))
        snail.lazy().catch(() => {})

        this.gate?.resolve()
        this.gate = null

    }

}