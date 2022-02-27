from constructs import Construct
from aws_cdk import (
    Duration,
    aws_sqs as sqs,
    aws_sns as sns,
    aws_sns_subscriptions as sns_subs,
    aws_iam as iam,
    CfnOutput,
    aws_s3 as s3,
    aws_apigateway as apigw,
    aws_lambda as _lambda,
    RemovalPolicy,
    aws_lambda_event_sources as lambda_event_source,
    Aws,
    Stack,
)


class SnsLambdaS3CloudfrontStack(Stack):
  def __init__(self, scope: Construct, id: str, **kwargs) -> None:
    super().__init__(scope, id, **kwargs)

    # Create a lambda function that is triggered by SNS event
    # and will read the message from the queue and write it to S3
    # bucket.
    sns_lambda = _lambda.Function(
      self,
      "SNSTriggerLambda",
      handler="lambda-handler.handler",
      runtime=_lambda.Runtime.PYTHON_3_7,
      # environment={"GDAL_DATA": "/opt/share/gdal", "PROJ_LIB": "/opt/share/proj"},
      # quite high, but downloading data takes a while
      # timeout=Duration.seconds(300),
      # memory_size=1024,
      # layers=[layer1, layer2],
      code=_lambda.Code.from_asset("lambda"),
    )


    noaa_gfs_sns_arn = "arn:aws:sns:us-east-1:123901341784:NewGFSObject"
    """
    sns_subs.Subscription(  
      self,
      "SNSSubscription",
      topic=sns.Topic.from_topic_arn(self, "SNSTopic", noaa_gfs_sns_arn),
    )
    """
    sns_lambda.add_event_source(
      lambda_event_source.SnsEventSource(
        sns.Topic.from_topic_arn(self, "SNSTopic", noaa_gfs_sns_arn),
      ),
    )
