from constructs import Construct
from aws_cdk import (
    Duration,
    RemovalPolicy,
    aws_sqs as sqs,
    aws_sns as sns,
    aws_sns_subscriptions as sns_subs,
    aws_iam as iam,
    CfnOutput,
    aws_s3 as s3,
    aws_cloudfront as cf,
    aws_cloudfront_origins as cf_origins,
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


    # Create bucket
    bucket = s3.Bucket(self, "noaa-processed-storage",
      removal_policy=RemovalPolicy.DESTROY,
      access_control=s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      encryption=s3.BucketEncryption.S3_MANAGED,
      auto_delete_objects=True,
      lifecycle_rules=[{
        "expiration": Duration.days(3)
      }],
      block_public_access=s3.BlockPublicAccess.BLOCK_ALL)

    oai = cf.OriginAccessIdentity(
      self, "OAI", comment="CF S3 connection"
    )
    bucket.grant_read(oai)
    distribution = cf.Distribution(
      self,
      "CloudFrontDistribution",
      minimum_protocol_version=cf.SecurityPolicyProtocol.TLS_V1_2_2018,
      enable_logging=True,
      default_behavior=cf.BehaviorOptions(
        allowed_methods=cf.AllowedMethods.ALLOW_ALL,
        origin=cf_origins.S3Origin(
          bucket=bucket,
          origin_access_identity=oai,
          origin_path="/",
        ),
        viewer_protocol_policy=cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      ),
      default_root_object="index.html",
      error_responses=[
        cf.ErrorResponse(
          http_status=404,
          response_page_path="/index.html",
          ttl=Duration.seconds(amount=0),
          response_http_status=200,
        )
      ],
    )
    CfnOutput(self, "CloudFrontDomainName", value=distribution.domain_name)

    # Delegating access control to access points
    # https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-policies.html
    bucket.add_to_resource_policy(iam.PolicyStatement(
      actions=["*"],
      principals=[iam.AnyPrincipal()],
      resources=[
        bucket.bucket_arn,
        bucket.arn_for_objects('*')
      ],
      conditions={
        "StringEquals":
          {
            "s3:DataAccessPointAccount": f"{Aws.ACCOUNT_ID}"
          }
        }
      )
    )

    S3_ACCESS_POINT_NAME = "noaa-processing"
    self.access_point = f"arn:aws:s3:{Aws.REGION}:{Aws.ACCOUNT_ID}:accesspoint/" \
                        f"{S3_ACCESS_POINT_NAME}"
    # Geolambda layers
    layer1 = _lambda.LayerVersion(self, 'geolambdapython',
      code=_lambda.Code.from_asset("lambda-deploy-python.zip"),
      description='GDAL etc.',
      compatible_runtimes=[
          _lambda.Runtime.PYTHON_3_7,
      ],
      removal_policy=RemovalPolicy.DESTROY)
    layer2 = _lambda.LayerVersion(self, 'geolambda',
      code=_lambda.Code.from_asset("lambda-deploy.zip"),
      description='GDAL Python bindings etc.',
      compatible_runtimes=[
          _lambda.Runtime.PYTHON_3_7,
      ],
      removal_policy=RemovalPolicy.DESTROY)
    # Create a lambda function that is triggered by SNS event
    # and will read the message from the queue and write it to S3
    # bucket.
    sns_lambda = _lambda.Function(
      self,
      "SNSTriggerLambda",
      handler="lambda-handler.handler",
      runtime=_lambda.Runtime.PYTHON_3_7,
      environment={
        "GDAL_DATA": "/opt/share/gdal", "PROJ_LIB": "/opt/share/proj",
        "CDK_PROCESSED_BUCKET_AP": self.access_point,
        "CDK_NOAA_BUCKET_ID": 'noaa-gfs-bdp-pds'
      },
      # quite high, but downloading data takes a while
      timeout=Duration.seconds(300),
      memory_size=1024,
      layers=[layer1, layer2],
      code=_lambda.Code.from_asset("lambda"),
    )

    # Attach NewGFSObject SNS topic to lambda we just created
    noaa_gfs_sns_arn = "arn:aws:sns:us-east-1:123901341784:NewGFSObject"
    sns_lambda.add_event_source(
      lambda_event_source.SnsEventSource(
        sns.Topic.from_topic_arn(self, "SNSTopic", noaa_gfs_sns_arn),
      ),
    )

    policy_doc = iam.PolicyDocument()
    policy_statement = iam.PolicyStatement(
      effect=iam.Effect.ALLOW,
      actions=["s3:PutObject"],
      principals=[
        iam.ArnPrincipal(sns_lambda.role.role_arn)
      ],
      resources=[
        f"{self.access_point}/object/*"
    ])
    policy_statement.sid = "AllowLambdaToUseAccessPoint"
    policy_doc.add_statements(policy_statement)

    s3.CfnAccessPoint(
      self, "noaa-processing_ap",
      bucket=bucket.bucket_name,
      name=S3_ACCESS_POINT_NAME,
      policy=policy_doc
    )

    CfnOutput(self, "noaaProcessingBucketArn", value=bucket.bucket_arn)
    CfnOutput(self, "noaaProcessingAccessPoint", value=self.access_point)

