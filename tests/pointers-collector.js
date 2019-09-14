const test = require('blue-tape')
const ReactiveDao = require("../index.js")

test("pointers collector", (t) => {
  t.plan(8)

  t.test("simple property", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      user: "123"
    },[
      ["users", "User", { property: "user" }]
    ])
    t.deepEqual(pointers, [["users","User","123"]], "found one user")
  })

  t.test("simple property from array", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers([
      { user: "123" },
      { user: "233" }
    ],[
      ["users", "User", { property: "user" }]
    ])
    t.deepEqual(pointers, [["users","User","123"], ["users","User","233"]], "found two users")
  })

  t.test("identity pointers", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers([ 0, 1, 2, 3 ], [
      [ 'test', 'user', { identity: true } ]
    ])
    t.deepEqual(pointers, [ [ 'test', 'user', 0 ], [ 'test', 'user', 1 ], [ 'test', 'user', 2 ],
      [ 'test', 'user', 3 ] ])
  })

  t.test("array property tags", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      tags: ["1", "2", "3"]
    },[
      ["tags", "Tag", { property: "tags" }]
    ])
    t.deepEqual(pointers, [
        ["tags","Tag","1"],
        ["tags","Tag","2"],
        ["tags","Tag","3"]
    ], "found 3 tags")
  })

  t.test("nested property", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      userData: {
        country: "PL"
      }
    },[
      ["country", { property: ["userData", "country"] }]
    ])
    t.deepEqual(pointers, [["country","PL"]], "found nested property value")
  })

  t.test("object result", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      user: "123",
      tags: ["1","2","3"]
    },[
      { object: {
        path: ["user",{ object: { user: { property: "user" }}}],
          next: { static: [[ "picture", { property: "picture" } ]] }
      } },
      { object: { path: ["tags", { property: "tags" }] } }
    ])
    t.deepEqual(pointers, [
      { path: ["user", { user: "123" }], next: [[ "picture", { property: "picture" } ]] },
      { path: ["tags","1"] },
      { path: ["tags","2"] },
      { path: ["tags","3"] }
    ], "complex result computed properly")
  })

  t.test("multiple sources", (t) => {
    t.plan(1)
    let sources = {
      interests: [ "cats", "dogs", "birds" ],
      city: { name: "NY" }
    }
    let pointers = ReactiveDao.collectPointers({}, [
      ["findProjects",
        { source: 'interests', schema: { array: { identity: true } }},
        { source: 'city', schema: { property: "name" } }]
    ], (src) => sources[src])
    t.deepEqual(pointers, [ [ 'findProjects', [ 'cats', 'dogs', 'birds' ], 'NY' ] ])
  })

  t.test("undefined argument", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({ sessionId: 1 },[
      ["users", "User", { property: "user" }]
    ])
    t.deepEqual(pointers, [])
  })
})
