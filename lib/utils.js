function errorToJSON(error) {
  if(typeof error == 'object') {
    var obj = {}
    Object.getOwnPropertyNames(error).forEach(function (key) {
      obj[key] = error[key]
    })
    return obj
  }
  return error
}

module.exports = {
  errorToJSON
}