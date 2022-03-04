export const onRequestGet = async ({env, params}) => {
  const url = new URL("https://" + env.CF_DOMAIN)
  url.host = env.CF_DOMAIN
  url.pathname = params.key
  return fetch(url.toString())
}