function sourceProxy(to) {
  const proxy = new Proxy({
    $toPath() {
      return to
    },
    $nonEmpty() {
      return sourceProxy({ nonEmpty: to })
    }
  }, {
    get(target, name) {
      if(name[0] == '$') {
        return target[name]
      } else {
        if(to && to.property) return sourceProxy({
          property: [...(Array.isArray(to.property) ? to.property : [to.property]), name]
        })
        return sourceProxy({ property: name })
      }
    }
  })
  return proxy
}

function resolve(schema) {
  if(Array.isArray(schema)) {
    return schema.map(resolve)
  }
  if(typeof schema == 'object') {
    if(schema.$toPath) return schema.$toPath()
    const out = {}
    for(const key in schema) out[key] = resolve(schema[key])
    return out
  }
  return schema
}

class Path {
  constructor(what, more = undefined, to = undefined) {
    this.what = what
    this.more = more
    this.to = to
  }
  with(...funcs) {
    let newMore = this.more ? this.more.slice() : []
    for(const func of funcs) {
      const source = sourceProxy()
      const fetchObject = func(source)
      const path = fetchObject.what.slice(0, -1)
      const params = fetchObject.what[fetchObject.what.length - 1]
      let processedParams = {}
      for(const key in params) {
        const param = params[key]
        //console.log("PARAM", key, param)
        const resolvedParam = resolve(param)
        //console.log("RESOLVED PARAM", key, resolvedParam)
        processedParams[key] = resolvedParam
      }
      const more = {
        schema: [[...path, { object: processedParams }]],
        more: fetchObject.more,
        to: fetchObject.to
      }
      newMore.push(more)
    }
    return new Path(this.what, newMore)
  }
  get(func) {
    const source = sourceProxy()
    const outputObject = func(source)
    return {
      source: this.what,
      schema: resolve(outputObject)
    }
  }

  bind(to) {
    return new Path(this.what, this.more, to)
  }
}

module.exports = Path