import { plugin } from "../src";
import AWS, { AWSError } from "aws-sdk";
import { NoopLogger } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/node";
import { ContextManager } from "@opentelemetry/context-base";
import { context, SpanKind } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  ReadableSpan,
} from "@opentelemetry/tracing";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { mockAwsSend } from "./testing-utils";
import { SqsAttributeNames } from "../src/services/sqs";
import { Message } from "aws-sdk/clients/sqs";

const logger = new NoopLogger();
const provider = new NodeTracerProvider();
const memoryExporter = new InMemorySpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
let contextManager: ContextManager;

const responseMockSuccess = {
  requestId: "0000000000000",
  error: null,
};

const expectReceiver2ProcessWithOneChildEach = (spans: ReadableSpan[]) => {
  const awsReceiveSpan = spans.filter(
    (s) => s.attributes[SqsAttributeNames.MESSAGING_OPERATION] === "receive"
  );
  expect(awsReceiveSpan.length).toBe(1);

  const processSpans = spans.filter(
    (s) => s.attributes[SqsAttributeNames.MESSAGING_OPERATION] === "process"
  );
  expect(processSpans.length).toBe(2);
  expect(processSpans[0].parentSpanId).toStrictEqual(
    awsReceiveSpan[0].spanContext.spanId
  );
  expect(processSpans[1].parentSpanId).toStrictEqual(
    awsReceiveSpan[0].spanContext.spanId
  );

  const processChildSpans = spans.filter((s) => s.kind === SpanKind.INTERNAL);
  expect(processChildSpans.length).toBe(2);
  expect(processChildSpans[0].parentSpanId).toStrictEqual(
    processSpans[0].spanContext.spanId
  );
  expect(processChildSpans[1].parentSpanId).toStrictEqual(
    processSpans[1].spanContext.spanId
  );
};

describe("sqs", () => {
  beforeAll(() => {
    AWS.config.credentials = {
      accessKeyId: "test key id",
      expired: false,
      expireTime: null,
      secretAccessKey: "test acc key",
      sessionToken: "test token",
    };
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());

    mockAwsSend(responseMockSuccess, {
      Messages: [
        { Body: JSON.stringify({ data: "msg 1" }) },
        { Body: JSON.stringify({ data: "msg 2" }) },
      ],
    } as AWS.SQS.Types.ReceiveMessageResult);
    plugin.enable(AWS, provider, logger);
  });

  afterEach(() => {
    memoryExporter.reset();
    contextManager.disable();
  });

  it("should set parent context in sqs receive callback", async (done) => {
    const sqs = new AWS.SQS();
    sqs
      .receiveMessage({
        QueueUrl: "queue/url/for/unittests",
      })
      .send((err: AWSError, data: AWS.SQS.Types.ReceiveMessageResult) => {
        expect(err).toBeFalsy();
        const childSpan = provider
          .getTracer("default")
          .startSpan("child span of sqs.receiveMessage in send callback");
        childSpan.end();
        const awsReceiveSpan = memoryExporter
          .getFinishedSpans()
          .filter((s) => s.kind === SpanKind.CONSUMER);
        expect(awsReceiveSpan.length).toBe(1);
        const internalSpan = memoryExporter
          .getFinishedSpans()
          .filter((s) => s.kind === SpanKind.INTERNAL);
        expect(internalSpan.length).toBe(1);
        expect(internalSpan[0].parentSpanId).toStrictEqual(
          awsReceiveSpan[0].spanContext.spanId
        );
        done();
      });
  });

  it("should set parent context in sqs receive after await", async () => {
    const sqs = new AWS.SQS();
    const res = await sqs
      .receiveMessage({
        QueueUrl: "queue/url/for/unittests",
      })
      .promise();

    const childSpan = provider
      .getTracer("default")
      .startSpan("child span of sqs.receiveMessage after promise await");
    childSpan.end();
    const awsReceiveSpan = memoryExporter
      .getFinishedSpans()
      .filter((s) => s.kind === SpanKind.CONSUMER);
    expect(awsReceiveSpan.length).toBe(1);
    const internalSpan = memoryExporter
      .getFinishedSpans()
      .filter((s) => s.kind === SpanKind.INTERNAL);
    expect(internalSpan.length).toBe(1);
    expect(internalSpan[0].parentSpanId).toStrictEqual(
      awsReceiveSpan[0].spanContext.spanId
    );
  });

  describe("process spans", () => {
    let receivedMessages: Message[];

    beforeEach(async () => {
      const sqs = new AWS.SQS();
      const res = await sqs
        .receiveMessage({
          QueueUrl: "queue/url/for/unittests",
        })
        .promise();
      receivedMessages = res.Messages;
    });

    it("should create processing child with forEach", async () => {
      receivedMessages.forEach((msg) => {
        const processChildSpan = provider
          .getTracer("default")
          .startSpan(`child span of sqs processing span of msg ${msg.Body}`);
        processChildSpan.end();
      });

      expectReceiver2ProcessWithOneChildEach(memoryExporter.getFinishedSpans());
    });

    it("should create processing child with map", async () => {
      receivedMessages.map((msg) => {
        const processChildSpan = provider
          .getTracer("default")
          .startSpan(`child span of sqs processing span of msg ${msg.Body}`);
        processChildSpan.end();
      });

      expectReceiver2ProcessWithOneChildEach(memoryExporter.getFinishedSpans());
    });

    it.skip("should create processing child with array index access", async () => {
      for (let i = 0; i < receivedMessages.length; i++) {
        const msg = receivedMessages[i];
        const processChildSpan = provider
          .getTracer("default")
          .startSpan(`child span of sqs processing span of msg ${msg.Body}`);
        processChildSpan.end();
      }

      expectReceiver2ProcessWithOneChildEach(memoryExporter.getFinishedSpans());
    });

    it.skip("should create processing child with map and forEach calls", async () => {
      receivedMessages
        .map((msg) => JSON.parse(msg.Body))
        .forEach((msgBody) => {
          const processChildSpan = provider
            .getTracer("default")
            .startSpan(`child span of sqs processing span of msg ${msgBody}`);
          processChildSpan.end();
        });

      expectReceiver2ProcessWithOneChildEach(memoryExporter.getFinishedSpans());
    });

    it.skip("should create processing child with filter and forEach", async () => {
      receivedMessages
        .filter((msg) => msg)
        .forEach((msgBody) => {
          const processChildSpan = provider
            .getTracer("default")
            .startSpan(`child span of sqs processing span of msg ${msgBody}`);
          processChildSpan.end();
        });

      expectReceiver2ProcessWithOneChildEach(memoryExporter.getFinishedSpans());
    });

    it.skip("should create processing child with for(msg of messages)", () => {
      for (const msg of receivedMessages) {
        const processChildSpan = provider
          .getTracer("default")
          .startSpan(`child span of sqs processing span of msg ${msg.Body}`);
        processChildSpan.end();
      }

      expectReceiver2ProcessWithOneChildEach(memoryExporter.getFinishedSpans());
    });
  });
});
