#!/usr/bin/env python3

from aws_cdk import App

from sns_lambda_s3_cloudfront.sns_lambda_s3_cloudfront_stack import SnsLambdaS3CloudfrontStack

app = App()
SnsLambdaS3CloudfrontStack(app, "SnsLambdaS3CloudfrontStack")

app.synth()
