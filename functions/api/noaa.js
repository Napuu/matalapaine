export const onRequestGet = async ({request, env}) => {
  const url = new URL(request.url)
  const currentPath = "/api/noaa"
  url.pathname = url.pathname.replace(currentPath, "")
  url.host = env.CF_DOMAIN
  return fetch(url.toString())
}
/*
onRequestGet({
  request: { url: "https://matalapaine.fi/api/noaa/test.jpeg"},
  env: { CF_DOMAIN: "kissa.cloudfront.net" }
})
*/