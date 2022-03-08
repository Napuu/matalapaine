export const onRequestGet = async ({env, params}) => {
  return handleOnRequestGet({env, params});
}

const handleOnRequestGet = async ({env, params}) => {
  const url = new URL("https://" + env.CF_DOMAIN)
  url.host = env.CF_DOMAIN
  url.pathname = params.date + "_noaa_wind.jpeg"
  console.log(url)
  return fetch(url.toString())
}
