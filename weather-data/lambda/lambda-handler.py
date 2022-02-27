import json
def handler(event, context):
    message_parsed = json.loads(event['Records'][0]['Sns']['Message'])
    key = message_parsed["Records"][0]["s3"]["object"]["key"]
    # the keys we're interested right now, are of following format:
    # gfs.20210226/18/gfs.t18z.sfluxgrbf010.grib2
    if (key.startswith("gfs.") and key.endswith(".grib2") and "sfluxgrbf" in key):
        print(key)
        return {
            'statusCode': 200,
        }
    return {
        'statusCode': 204,
    }

