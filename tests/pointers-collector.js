const test = require('blue-tape')
const ReactiveDao = require("../index.js")

test("pointers collector", (t) => {
  t.plan(14)

  t.test("simple property", (t) => {
    t.plan(2)
    let pointers = ReactiveDao.collectPointers({
      user: "123"
    },[
      ["users", "User", { property: "user" }]
    ])
    t.equal(!!pointers.many, false)
    t.deepEqual(pointers.slice(), [["users","User","123"]], "found one user")
  })

  t.test("simple property from array", (t) => {
    t.plan(2)
    let pointers = ReactiveDao.collectPointers([
      { user: "123" },
      { user: "233" }
    ],[
      ["users", "User", { property: "user" }]
    ])
    t.equal(!!pointers.many, true)
    t.deepEqual(pointers.slice(), [["users","User","123"], ["users","User","233"]], "found two users")
  })

  t.test("identity pointers", (t) => {
    t.plan(2)
    let pointers = ReactiveDao.collectPointers([ 0, 1, 2, 3 ], [
      [ 'test', 'user', { identity: true } ]
    ])
    t.equal(!!pointers.many, true)
    t.deepEqual(pointers.slice(), [ [ 'test', 'user', 0 ], [ 'test', 'user', 1 ], [ 'test', 'user', 2 ],
      [ 'test', 'user', 3 ] ])
  })

  t.test("array property tags", (t) => {
    t.plan(2)
    let pointers = ReactiveDao.collectPointers({
      tags: ["1", "2", "3"]
    },[
      ["tags", "Tag", { property: "tags" }]
    ])
    t.equal(!!pointers.many, true)
    t.deepEqual(pointers.slice(), [
        ["tags","Tag","1"],
        ["tags","Tag","2"],
        ["tags","Tag","3"]
    ], "found 3 tags")
  })

  t.test("nested property", (t) => {
    t.plan(2)
    let pointers = ReactiveDao.collectPointers({
      userData: {
        country: "PL"
      }
    },[
      ["country", { property: ["userData", "country"] }]
    ])
    t.equal(!!pointers.many, false)
    t.deepEqual(pointers.slice(), [["country","PL"]], "found nested property value")
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
    t.deepEqual(pointers.slice(), [
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
        { source: { static: 'city' }, schema: { property: "name" } }]
    ], (src) => sources[src])
    t.deepEqual(JSON.parse(JSON.stringify(pointers)), [ [ 'findProjects', [ 'cats', 'dogs', 'birds' ], 'NY' ] ])
  })

  t.test("undefined argument", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({ sessionId: 1 },[
      ["users", "User", { property: "user" }]
    ])
    t.deepEqual(pointers.slice(), [])
  })

  t.test("undefined argument in object", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({ sessionId: 1 },[
      ["users", "User", { object: { user: { property: "user" }}}]
    ])
    t.deepEqual(pointers.slice(), [])
  })

  t.test("switch match", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      country: "PL"
    },[
      [{ value: { property: "country" }, switch: {
          PL: "Warsaw",
          US: "New York"
        }}]
    ])
    t.deepEqual(pointers.slice(), [["Warsaw"]], "switch working")
  })

  t.test("switch default", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      country: "UX"
    },[
      [{ value: { property: "country" }, switch: {
          PL: "Warsaw",
          US: "New York"
        },
        default: "London"}]
    ])
    t.deepEqual(pointers.slice(), [["London"]], "switch working")
  })

  t.test("switch not match", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      country: "UX"
    },[
      [{ value: { property: "country" }, switch: {
          PL: "Warsaw",
          US: "New York"
        }}]
    ])
    t.deepEqual(pointers.slice(), [], "switch working")
  })

  t.test("test nonEmpty", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      user: null
    },[
      ["users", "User", { nonEmpty: { property: "user" }}]
    ])
    t.deepEqual(pointers.slice(), [], "nulls are filtered")
  })

  t.test("test complex property fetch", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      "data": {
        "sidebarItems": [
          {
            "category": [
              "subject",
              "b1c840d5b5f6949c34545a9afc22ae0e",
              null
            ]
          },
          {
            "category": [
              "subject",
              "7491ba08936b462d28f875c6cfb16dde",
              "5b6ee5d81d698e6408302138aff15028",
              null
            ]
          }
        ]
      }
    },[
      ['categories', 'CategoryOne', { object: {
          category: { nonEmpty: { property: ['data', 'sidebarItems','category'] } }
      } }]
    ])
    t.deepEqual(pointers.slice(), [
          [
            "categories",
            "CategoryOne",
            {
              "category": "subject"
            }
          ],
          [
            "categories",
            "CategoryOne",
            {
              "category": "b1c840d5b5f6949c34545a9afc22ae0e"
            }
          ],
          [
            "categories",
            "CategoryOne",
            {
              "category": "subject"
            }
          ],
          [
            "categories",
            "CategoryOne",
            {
              "category": "7491ba08936b462d28f875c6cfb16dde"
            }
          ],
          [
            "categories",
            "CategoryOne",
            {
              "category": "5b6ee5d81d698e6408302138aff15028"
            }
          ]
        ], "results match")
  })



})
