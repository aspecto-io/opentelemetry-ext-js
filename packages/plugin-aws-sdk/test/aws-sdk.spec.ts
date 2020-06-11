import { plugin } from "../src";
import AWS from "aws-sdk";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  ReadableSpan,
  Span,
} from "@opentelemetry/tracing";
import { context, CanonicalCode } from "@opentelemetry/api";
import { NoopLogger } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/node";
import { ContextManager } from "@opentelemetry/context-base";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { AttributeNames } from "../src/enums";

describe("plugin-aws-sdk", () => {
  const logger = new NoopLogger();
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  let contextManager: AsyncHooksContextManager;

  const responseMock = {
    requestId: "0000000000000",
    error: null,
    data: null,
  };

  const responseMockWithError = {
    ...responseMock,
    error: "something went wrong",
  };

  const getAwsSpans = (): ReadableSpan[] => {
    // console.log(' spans :', memoryExporter.getFinishedSpans());
    return memoryExporter
      .getFinishedSpans()
      .filter((s) => s.attributes[AttributeNames.COMPONENT] === "aws-sdk");
  };

  let mockWithError = false;
  const getMock = () => (mockWithError ? responseMockWithError : responseMock);

  beforeAll(() => {
    AWS.config.credentials = {
      accessKeyId: "test key id",
      expired: false,
      expireTime: null,
      secretAccessKey: "test acc key",
      sessionToken: "test token",
    };

    AWS.Request.prototype.send = function (cb: (error, response) => void) {
      (this as AWS.Request<any, any>).on("complete", (response) => {
        cb(response.error, response);
      });
      const response = {
        ...getMock(),
        request: this,
      };
      setTimeout(() => {
        this._events.complete.forEach((handler) => handler(response));
      }, 0);
      return response;
    };

    AWS.Request.prototype.promise = function () {
      const response = {
        ...getMock(),
        request: this,
      };
      this._events.complete.forEach((handler) => handler(response));
      return Promise.resolve(response);
    };
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
  });

  afterEach(() => {
    memoryExporter.reset();
    contextManager.disable();
  });

  describe("functional", () => {
    beforeAll(() => {
      plugin.enable(AWS, provider, logger);
    });

    it("adds proper number of spans with correct attributes", async (done) => {
      mockWithError = false;
      const s3 = new AWS.S3();
      const bucketName = "aws-test-bucket";
      const keyName = "aws-test-object.txt";
      await new Promise((resolve) => {
        // span 1
        s3.createBucket({ Bucket: bucketName }, async function (err, data) {
          const params = {
            Bucket: bucketName,
            Key: keyName,
            Body: "Hello World!",
          };
          // span 2
          s3.putObject(params, function (err, data) {
            if (err) console.log(err);
            resolve();
          });
        });
      });

      const awsSpans = getAwsSpans();
      expect(awsSpans.length).toBe(2);
      const [spanCreateBucket, spanPutObject] = awsSpans;

      expect(spanCreateBucket.attributes[AttributeNames.COMPONENT]).toBe(
        "aws-sdk"
      );
      expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe(
        "createBucket"
      );
      expect(
        spanCreateBucket.attributes[AttributeNames.AWS_SIGNATURE_VERSION]
      ).toBe("s3");
      expect(spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_API]).toBe(
        "S3"
      );
      expect(
        spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_IDENTIFIER]
      ).toBe("s3");
      expect(spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_NAME]).toBe(
        "Amazon S3"
      );
      expect(spanCreateBucket.attributes[AttributeNames.AWS_REQUEST_ID]).toBe(
        responseMock.requestId
      );
      expect(spanCreateBucket.name).toBe("aws.s3.createBucket");

      expect(spanPutObject.attributes[AttributeNames.COMPONENT]).toBe(
        "aws-sdk"
      );
      expect(spanPutObject.attributes[AttributeNames.AWS_OPERATION]).toBe(
        "putObject"
      );
      expect(
        spanPutObject.attributes[AttributeNames.AWS_SIGNATURE_VERSION]
      ).toBe("s3");
      expect(spanPutObject.attributes[AttributeNames.AWS_SERVICE_API]).toBe(
        "S3"
      );
      expect(
        spanPutObject.attributes[AttributeNames.AWS_SERVICE_IDENTIFIER]
      ).toBe("s3");
      expect(spanPutObject.attributes[AttributeNames.AWS_SERVICE_NAME]).toBe(
        "Amazon S3"
      );
      expect(spanPutObject.attributes[AttributeNames.AWS_REQUEST_ID]).toBe(
        responseMock.requestId
      );
      expect(spanPutObject.name).toBe("aws.s3.putObject");

      done();
    });

    it("adds error attribute properly", async (done) => {
      mockWithError = true;
      const s3 = new AWS.S3();
      const bucketName = "aws-test-bucket";
      const keyName = "aws-test-object.txt";
      await new Promise((resolve) => {
        s3.createBucket({ Bucket: bucketName }, async function () {
          resolve();
        });
      });

      const awsSpans = getAwsSpans();
      expect(awsSpans.length).toBe(1);
      const [spanCreateBucket] = awsSpans;
      expect(spanCreateBucket.attributes[AttributeNames.AWS_ERROR]).toBe(
        responseMockWithError.error
      );
      done();
    });

    it("adds proper number of spans with correct attributes if both, promise and callback were used", async (done) => {
      mockWithError = false;
      const s3 = new AWS.S3();
      const bucketName = "aws-test-bucket";
      const keyName = "aws-test-object.txt";
      await new Promise((resolve) => {
        // span 1
        s3.createBucket({ Bucket: bucketName }, async function (err, data) {
          const params = {
            Bucket: bucketName,
            Key: keyName,
            Body: "Hello World!",
          };

          let reqPromise: Promise<any> | null = null;
          let numberOfCalls = 0;
          const cbPromise = new Promise(async (resolveCb) => {
            // span 2
            const request = s3.putObject(params, function (err, data) {
              if (err) console.log(err);
              numberOfCalls++;
              if (numberOfCalls === 2) {
                resolveCb();
              }
            });
            // NO span
            reqPromise = request.promise();
          });

          await Promise.all([cbPromise, reqPromise]).then(() => {
            resolve();
          });
        });
      });

      const awsSpans = getAwsSpans();
      expect(awsSpans.length).toBe(2);
      const [spanCreateBucket, spanPutObjectCb] = awsSpans;
      expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe(
        "createBucket"
      );
      expect(spanPutObjectCb.attributes[AttributeNames.AWS_OPERATION]).toBe(
        "putObject"
      );
      done();
    });

    it("adds proper number of spans with correct attributes if only promise was used", async (done) => {
      mockWithError = false;
      const s3 = new AWS.S3();
      const bucketName = "aws-test-bucket";
      const keyName = "aws-test-object.txt";
      await new Promise((resolve) => {
        // span 1
        s3.createBucket({ Bucket: bucketName }, async function (err, data) {
          const params = {
            Bucket: bucketName,
            Key: keyName,
            Body: "Hello World!",
          };

          let reqPromise: Promise<any> | null = null;
          // NO span
          const request = s3.putObject(params);
          // span 2
          await request.promise();
          resolve();
        });
      });

      const awsSpans = getAwsSpans();
      expect(awsSpans.length).toBe(2);
      const [spanCreateBucket, spanPutObjectCb] = awsSpans;
      expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe(
        "createBucket"
      );
      expect(spanPutObjectCb.attributes[AttributeNames.AWS_OPERATION]).toBe(
        "putObject"
      );
      done();
    });
  });

  describe("plugin config", () => {
    it("preRequestHook called and add request attribute to span", (done) => {
      const pluginConfig = {
        enabled: true,
        preRequestHook: (
          span: Span,
          request: { params: { [name: string]: any } }
        ) => {
          span.setAttribute("attribute from hook", request.params["Bucket"]);
        },
      };

      plugin.enable(AWS, provider, logger, pluginConfig);

      const s3 = new AWS.S3();
      const bucketName = "aws-test-bucket";

      s3.createBucket({ Bucket: bucketName }, async function (err, data) {
        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(1);
        expect(awsSpans[0].attributes["attribute from hook"]).toStrictEqual(
          bucketName
        );
        done();
      });
    });

    it("preRequestHook throws does not fail span", (done) => {
      const pluginConfig = {
        enabled: true,
        preRequestHook: (span: Span, request: any) => {
          throw new Error("error from request hook");
        },
      };

      plugin.enable(AWS, provider, logger, pluginConfig);

      const s3 = new AWS.S3();
      const bucketName = "aws-test-bucket";

      s3.createBucket({ Bucket: bucketName }, async function (err, data) {
        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(1);
        expect(awsSpans[0].status.code).toStrictEqual(CanonicalCode.OK);
        done();
      });
    });
  });
});
