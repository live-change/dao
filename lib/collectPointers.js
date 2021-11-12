function flatMap(source, fun) {
  let results = source.map(fun)
  let count = 0
  let many = source.many
  for(let result of results) {
    count += result.length
    many = many || result.many
  }
  if(count > 1 && !many) throw new Error("too many results from not many")
  let out = new Array(count)
  out.many = many
  let p = 0
  for(let result of results) {
    for(let element of result) out[p++] = element
  }
  return out
}

function getPropertyValues(source, property) {
  if(Array.isArray(source)) {
    return flatMap(markMany(source), v => getPropertyValues(v, property))
  } else {
    if(source === undefined) return []
    if(source === null) return []
    let v = source[property]
    if(Array.isArray(v)) return markMany(v)
    if(v === undefined) return []
    return [v]
  }
}

function getNestedPropertyValues(source, property) {
  let accumulator = [source]
  for(let part of property) {
    accumulator = flatMap(accumulator, s => getPropertyValues(s, part))
  }
  return accumulator
}

function markMany(arr) {
  arr = arr.slice()
  arr.many = true
  return arr
}

function cross(lists) {
  let count = 1
  let many = false
  for(let list of lists) {
    count *= list.length
    many = many || list.many
  }
  let out = new Array(count)
  out.many = many
  if(count > 1 && !many) throw new Error("more than one result for non array fields")
  for(let i = 0; i < count; i++) {
    let res = new Array(lists.length)
    let a = i
    for(let j = lists.length-1; j >= 0; j--) {
      let list = lists[j]
      res[j] = list[ a % list.length ]
      a=( a / list.length ) | 0
    }
    out[i] = res
  }
  return out
}

function collect(source, schema, getSource) {
  if(typeof schema == 'string') {
    return [schema]
  } else if(typeof schema != 'object') {
    return [schema]
  } else if(Array.isArray(schema)) {
    let partValues = new Array(schema.length)
    for(let i = 0; i < schema.length; i++) {
      partValues[i] = collect(source, schema[i], getSource)
    }
    return cross(partValues)
  } else {
    if(schema.source) {
      const sourcePointers = collect(source, schema.source, getSource)
      return flatMap( sourcePointers, ptr => {
        const source = getSource(ptr)
        const results = collect(source, schema.schema, getSource)
        return results
      })
    } else if(schema.nonEmpty) {
      const collected = collect(source, schema.nonEmpty, getSource)
      const result = collected.filter(x=>!!x)
      result.many = collected.many
      return result
    } else if(schema.identity) {
      if(typeof source == 'undefined' || source === null) return []
      return Array.isArray(source) ? markMany(source) : [source]
    } else if(schema.array) {
      return [ collect(source, schema.array, getSource) ]
    } else if(schema.property) {
      if(typeof source == 'undefined' || source === null) return []
      if(Array.isArray(schema.property)) {
        let values = getNestedPropertyValues(source, schema.property)
        return values
      } else {
        let values = getPropertyValues(source, schema.property)
        return values
      }
    } else if(schema.switch) {
      const values = collect(source, schema.value, getSource)
      return flatMap(values, v => {
        const found = schema.switch[v]
        if(found) return collect(source, found, getSource)
        if(schema.default) return collect(source, schema.default, getSource)
        return []
      })
    } else if(schema.static) {
      return [schema.static]
    } else {
      let objectSchema = schema.object ? schema.object : schema
      let propValues = []
      let propId = 0
      for(let key in objectSchema) {
        let values = collect(source, objectSchema[key], getSource)
        propValues[propId] = values
        propId++
      }
      let crossed = cross(propValues)
      let results = new Array(crossed.length)
      for(let i = 0; i < crossed.length; i++) {
        let result = {}
        let j = 0
        for(let key in objectSchema) {
          result[key] = crossed[i][j++]
        }
        results[i] = result
      }
      results.many = crossed.many
      return results
    }
  }
}

function collectPointers(source, schemas, getSource) {
  let results = []
  for(let schema of schemas) {
    const collected = collect(source, schema, getSource)
    const many = results.many || collected.many
    results = results.concat(collected)
    results.many = many
  }
  return results
}

module.exports = collectPointers
