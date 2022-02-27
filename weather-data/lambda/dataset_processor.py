import boto3
import rasterio
import os
import numpy as np
from osgeo import gdal
from botocore.handlers import disable_signing
from typing import List

DATASET_TMP_PATH = "/tmp/tmp.grib2"
GDAL_TMP_FILE = "/tmp/temp.tiff"
FINAL_IMG = "/tmp/final.jpeg"
NOAA_BUCKET_ID = 'noaa-gfs-bdp-pds'

if ('CDK_NOAA_BUCKET_ID' in os.environ):
  NOAA_BUCKET_ID = os.environ['CDK_NOAA_BUCKET_ID']

def get_file_s3_unsigned(bucket: str, key: str, tmp_path: str) -> None:
  s3 = boto3.resource('s3')
  gfs_res = s3.Bucket(bucket)
  gfs_res.meta.client.meta.events.register('choose-signer.s3.*', disable_signing)
  gfs_res.download_file(key, tmp_path)

def put_file_s3(bucket: str, key: str, file_path: str) -> None:
  s3 = boto3.resource('s3')
  s3.Bucket(bucket).upload_file(file_path, key)

def process_dataset(file_in: str, file_out: str, tmp_file: str) -> None:
  ds = gdal.Open(file_in)
  bands = [
      "UGRD", # U component of wind (m/s)
      "VGRD", # V component of wind (m/s)
      # "TMP", # Temperature (C)
      # "TCDC" # Total cloud cover (%)
  ]
  band_indexes = {}
  for i in range(1, ds.RasterCount + 1):
      band = ds.GetRasterBand(i)
      grib_element = band.GetMetadata()['GRIB_ELEMENT']
      if (grib_element in bands):
          band_indexes[grib_element] = i

  in_srs = "+proj=longlat +datum=WGS84 +lon_wrap=180"
  out_srs = "EPSG:3857"

  # sort bands alphabetically, so they are always in the same order
  band_keys_sorted = sorted(list(band_indexes.keys()))
  band_indexes_sorted_by_key = [band_indexes[key] for key in band_keys_sorted]

  # pick the bands we want from grib file
  translated = gdal.Translate("", ds, bandList=band_indexes_sorted_by_key, format="VRT")

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
      # rasterio band indexing starts from 0
      u_index = band_indexes["UGRD"] + 1
      v_index = band_indexes["VGRD"] + 1
      u_rescaled = np.interp(u_index, (-50, 50), (0, 255)).astype(np.uint8)
      v_rescaled = np.interp(v_index, (-50, 50), (0, 255)).astype(np.uint8)
      # In a sense this band three is completely redundant, but WebGL lookup from a picture 
      # like this was easier, so keeping it this way for now.
      speed = np.sqrt(src.read(u_index)**2 + src.read(v_index)**2).astype(np.uint8)
      dst.write(u_rescaled, 1)
      dst.write(v_rescaled, 2)
      dst.write(speed, 3)

def delete_files_if_exists(files: List[str]) -> None:
  for f in files:
    if os.path.exists(f):
      os.unlink(f)

def handle_new_gfs(key: str):
  # If we get same execution context as from previous lambda invocation,
  # we might have unncessary files there filling up the 512M limit on /tmp.
  delete_files_if_exists([DATASET_TMP_PATH, GDAL_TMP_FILE, FINAL_IMG]) 
  get_file_s3_unsigned(NOAA_BUCKET_ID, key, DATASET_TMP_PATH)
  process_dataset(DATASET_TMP_PATH, FINAL_IMG, GDAL_TMP_FILE)
  put_file_s3(NOAA_PROCESSED_BUCKET, "TODO", FINAL_IMG)