const test = require('blue-tape')
const ReactiveDao = require("../index.js")

test("pointers collector", (t) => {
  t.plan(4)

  t.test("simple property", (t) => {
    t.plan(1)
    let pointers = ReactiveDao.collectPointers({
      user: "123"
    },[
      ["users", "User", { property: "user" }]
    ])
    t.deepEqual(pointers, [["users","User","123"]], "found one user")
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


})