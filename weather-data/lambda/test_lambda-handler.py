from dataset_processor import process_dataset, delete_files_if_exists, get_file_s3_unsigned, put_file_s3
import os
import boto3
from moto import mock_s3
from osgeo import gdal

def test_delete_files():
    tmp_file1 = f'/tmp/{os.urandom(16).hex()}'
    tmp_file2 = f'/tmp/{os.urandom(16).hex()}'
    
    open(tmp_file1, 'a').close()
    open(tmp_file2, 'a').close()

    assert(os.path.exists(tmp_file1))
    assert(os.path.exists(tmp_file2))

    delete_files_if_exists([tmp_file1, tmp_file2])

    assert(os.path.exists(tmp_file1) == False)
    assert(os.path.exists(tmp_file2) == False)


@mock_s3
def test_get_file_s3_unsigned():
    conn = boto3.resource('s3', region_name='us-east-1')
    bucket_name = 'noaa-gfs-bdp-pds'
    test_key = 'noaa.grib2'
    test_file_contents = 'test_content'
    test_file_location = f'/tmp/{test_key}'
    conn.create_bucket(Bucket=bucket_name)

    s3 = boto3.client('s3', region_name='us-east-1')
    s3.put_object(Bucket=bucket_name, Key=test_key, Body=test_file_contents)

    # By setting TEST_ENV to True, we actually *enable* the signing of the s3 requests,
    # since it's easier to mock which kind of undermines the point of this test, but oh well.
    get_file_s3_unsigned(bucket_name, test_key, test_file_location, TEST_ENV=True)
    assert open(test_file_location, 'r').read() == test_file_contents

    os.unlink(test_file_location)

def test_process_dataset_wind():
    test_file_in = './test/multiple_ugrd_vgrd.grib2'
    test_file_out = '/tmp/test_file_out.jpeg'
    test_file_tmp = '/tmp/test_file_tmp.tiff'

    timestring = process_dataset(test_file_in, test_file_out, test_file_tmp, 'wind')
    assert timestring == "2022-02-23T12:00:00Z"

    # should create files and not delete them
    assert(os.path.exists(test_file_out) == True)
    assert(os.path.exists(test_file_tmp) == True)

    os.unlink(test_file_tmp)

    # test that output contents are correct
    ds_out = gdal.Open(test_file_out)
    assert ds_out.RasterCount == 3
    assert ds_out.GetRasterBand(1).Checksum() == 65057
    assert ds_out.GetRasterBand(2).Checksum() == 65512
    assert ds_out.GetRasterBand(3).Checksum() == 60493
    del ds_out

    os.unlink(test_file_out)

@mock_s3
def test_put_file_s3():
    conn = boto3.resource('s3', region_name='us-east-1')
    bucket_name = 'noaa-gfs-bdp-pds'
    test_key = 'haloo'
    test_file_contents = 'test_content'
    test_file_location = f'/tmp/{test_key}'
    conn.create_bucket(Bucket=bucket_name)
    with open(test_file_location, "w") as file:
        file.write(test_file_contents)

    put_file_s3(bucket_name, test_key, test_file_location)

    body = conn.Object(bucket_name, test_key).get()[
        'Body'].read().decode("utf-8")
    assert body == test_file_contents

    os.unlink(test_file_location)