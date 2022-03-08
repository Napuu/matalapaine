import boto3
import rasterio
import os
import numpy as np
from osgeo import gdal
from botocore.handlers import disable_signing
from typing import List
from datetime import datetime

DATASET_TMP_PATH = "/tmp/tmp.grib2"
GDAL_TMP_FILE = "/tmp/temp.tiff"
FINAL_IMG = "/tmp/final.jpeg"
NOAA_BUCKET = 'noaa-gfs-bdp-pds'
PROCESSED_BUCKET_AP = 'arn:aws:s3:eu-west-1:168000702421:accesspoint/noaa-processing'

if ('CDK_NOAA_BUCKET_ID' in os.environ):
  NOAA_BUCKET = os.environ['CDK_NOAA_BUCKET_ID']
if ('CDK_PROCESSED_BUCKET_AP' in os.environ):
  PROCESSED_BUCKET_AP = os.environ['CDK_PROCESSED_BUCKET_AP']

def get_file_s3_unsigned(bucket: str, key: str, file_path: str, TEST_ENV=False) -> None:
  s3 = boto3.resource('s3')
  gfs_res = s3.Bucket(bucket)
  # Enable unsigned s3 requests only while not testing
  # as mocking them is difficult.
  if (not TEST_ENV):
    gfs_res.meta.client.meta.events.register('choose-signer.s3.*', disable_signing)
  gfs_res.download_file(key, file_path)

def put_file_s3(bucket: str, key: str, file_path: str) -> None:
  s3 = boto3.resource('s3')
  s3.Bucket(bucket).upload_file(file_path, key)

# Processes the dataset and returns timestamp as a string.
def process_dataset(file_in: str, file_out: str, tmp_file: str, mode: str) -> str:
  ds = gdal.Open(file_in)
  ds_time = datetime.utcfromtimestamp(
    int(ds.GetRasterBand(1).GetMetadataItem('GRIB_VALID_TIME').replace("sec UTC", ""))
  )
  valid_timestring = ds_time.strftime('%Y-%m-%dT%H:%M:%S')
  # if ds_time is more than 6 hours in the future, discard it
  # this should be parsed directly from the filename, but this works out too
  if (ds_time - datetime.utcnow()).total_seconds() > 6 * 60 * 60:
    return {
      "status": "noop",
      "valid_timestring": valid_timestring,
    }
  ugrd = "UGRD"
  vgrd = "VGRD"
  bands = None
  if (mode == "wind"):
    bands = [
      { # U component of wind (m/s)
        "GRIB_ELEMENT": ugrd,
        "GRIB_SHORT_NAME": "10-HTGL"
      },
      { # V component of wind (m/s)
        "GRIB_ELEMENT": vgrd,
        "GRIB_SHORT_NAME": "10-HTGL"
      },
    ]
  band_indexes = {}
  for i in range(1, ds.RasterCount + 1):
      band = ds.GetRasterBand(i)
      grib_element = band.GetMetadata()['GRIB_ELEMENT']
      grib_short_name = band.GetMetadata()['GRIB_SHORT_NAME']
      for (band_idx, band_dict) in enumerate(bands):
        if (grib_element == band_dict['GRIB_ELEMENT'] and grib_short_name == band_dict['GRIB_SHORT_NAME']):
          band_indexes[grib_element] = i
          break

  in_srs = "+proj=longlat +datum=WGS84 +lon_wrap=180"
  out_srs = "EPSG:3857"

  band_indexes_keys = band_indexes.values()

  # pick the bands we want from grib file
  translated = gdal.Translate("", ds, bandList=band_indexes_keys, format="VRT")

  # reproject to epsg:3857 and cut to sensible bounds (taken manually from qgis osm layer)
  bounds = [-20037508.3427892439067364,-20037508.3427892550826073,20037508.3427892439067364,20037508.3427892439067364]
  # write reprojected file to tmp file so we can pick bands we want with rasterio
  warped = gdal.Warp(tmp_file, translated, dstNodata=9999, srcSRS=in_srs, dstSRS=out_srs, outputBounds=bounds, creationOptions=["COMPRESS=LZW"])

  # write dataset to disk
  del warped
  del translated

  # only 512mb of disk space is available for lambda, so deletion here might be necessary
  # os.unlink(file_in)

  with rasterio.open(tmp_file) as src:
    with rasterio.open(file_out, "w", width=src.shape[0], height=src.shape[1], count=3, dtype='uint8') as dst:
      if (mode == "wind"):
        # rasterio band indexing starts from 0
        u_index = [index for index, value in enumerate(band_indexes) if value == ugrd][0] + 1
        v_index = [index for index, value in enumerate(band_indexes) if value == vgrd][0] + 1
        u_raw = src.read(u_index)
        v_raw = src.read(v_index)
        u_rescaled = np.interp(u_raw, (-50, 50), (0, 255)).astype(np.uint8)
        v_rescaled = np.interp(v_raw, (-50, 50), (0, 255)).astype(np.uint8)
        # In a sense this band three is completely redundant, but WebGL lookup from a picture 
        # like this was easier, so keeping it this way for now.
        speed = np.sqrt(src.read(u_index)**2 + src.read(v_index)**2).astype(np.uint8)
        dst.write(u_rescaled, 1)
        dst.write(v_rescaled, 2)
        dst.write(speed, 3)
      else:
        print("Mode not supported")
  return {
    "status": "update",
    "valid_timestring": valid_timestring,
  }

def delete_files_if_exists(files: List[str]) -> None:
  for f in files:
    if os.path.exists(f):
      os.unlink(f)

def key_is_fresh_enough(key: str) -> bool:
  # gfs.20210226/18/gfs.t18z.sfluxgrbf010.grib2
  hours = int(key.split("sfluxgrbf")[1].split(".")[0])
  return hours < 24

def handle_new_gfs(key: str):
  if not key_is_fresh_enough(key):
    print("Hour more than 24h in the future, skipping" + key)
    return
  # If we get same execution context as from previous lambda invocation,
  # we might have unncessary files there filling up the 512M limit on /tmp.
  delete_files_if_exists([DATASET_TMP_PATH, GDAL_TMP_FILE, FINAL_IMG]) 
  get_file_s3_unsigned(NOAA_BUCKET, key, DATASET_TMP_PATH)
  for mode in ["wind"]:
    result = process_dataset(DATASET_TMP_PATH, FINAL_IMG, GDAL_TMP_FILE, "wind")
    if (result["status"] == "update"):
      output_key = f'{result["valid_timestring"]}_noaa_{mode}.jpeg'
      put_file_s3(PROCESSED_BUCKET_AP, output_key, FINAL_IMG)
    else:
      print("Not updating, too far in the future")
