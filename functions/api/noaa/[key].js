const onRequestGet = async ({env, params}) => {
  const url = new URL("https://" + env.CF_DOMAIN)
  url.host = env.CF_DOMAIN
  url.pathname = params.key
  return fetch(url.toString())
}
/*
onRequestGet({
  params: { key: "test.jpeg"},
  env: { CF_DOMAIN: "kissa.cloudfront.net" }
})
*/