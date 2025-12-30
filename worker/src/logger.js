export function log(level, msg, fields = {}) {
  console.log(
    JSON.stringify({
      ts: Date.now(),
      level,
      msg,
      ...fields
    })
  )
}