/*
    For the request to be sent, one of the two conditions has to be true:
        a callback was passed to the request
        a promise was retrieved from the request

    Number of times "onComplete" event is fired:
                |   w/o promise()   |   w/ promise()
    no callback |       0           |       1    
    callback    |       1           |       2   
 */
import { BasePlugin } from "@opentelemetry/core";
import { Span } from "@opentelemetry/api";
import * as shimmer from "shimmer";
import AWS from "aws-sdk";
import { AttributeNames } from "./enums";
import {
  getRequestServiceAttributes,
  getResponseServiceAttributes,
} from "./services";

const VERSION = "0.0.3";

class AwsPlugin extends BasePlugin<typeof AWS> {
  readonly component: string;
  private activeRequests: Set<AWS.Request<any, any>> = new Set();

  constructor(readonly moduleName: string) {
    super(`opentelemetry-plugin-aws-sdk`, VERSION);
  }

  protected patch() {
    this._logger.debug(
      "applying patch to %s@%s",
      this.moduleName,
      this.version
    );

    shimmer.wrap(
      this._moduleExports?.Request.prototype,
      "send",
      this._patchRequestMethod()
    );
    shimmer.wrap(
      this._moduleExports?.Request.prototype,
      "promise",
      this._patchRequestMethod()
    );

    return this._moduleExports;
  }

  protected unpatch() {
    shimmer.unwrap(this._moduleExports?.Request.prototype, "send");
    shimmer.unwrap(this._moduleExports?.Request.prototype, "promise");
  }

  private _patchRequestMethod = () => {
    return this._getPatchedRequestMethod;
  };

  private _getPatchedRequestMethod = (original: Function) => {
    const thisPlugin = this;

    return function () {
      let span: Span | null = null;
      /* 
               if the span was already started, we don't want to start a new one 
               when Request.promise() is called
            */

      if (
        this._asm.currentState !== "complete" &&
        !thisPlugin.activeRequests.has(this)
      ) {
        thisPlugin.activeRequests.add(this);

        span = thisPlugin._tracer.startSpan(thisPlugin._getSpanName(this), {
          attributes: {
            // [AspectoAttributeNames.PLUGIN_NAME]: awsModuleName,
            [AttributeNames.COMPONENT]: thisPlugin.moduleName,
            [AttributeNames.AWS_OPERATION]: this.operation,
            [AttributeNames.AWS_PARAMS]: JSON.stringify(this.params),
            [AttributeNames.AWS_SIGNATURE_VERSION]: this.service?.config
              ?.signatureVersion,
            [AttributeNames.AWS_REGION]: this.service?.config?.region,
            [AttributeNames.AWS_SERVICE_API]: this.service?.api?.className,
            [AttributeNames.AWS_SERVICE_IDENTIFIER]: this.service
              ?.serviceIdentifier,
            [AttributeNames.AWS_SERVICE_NAME]: this.service?.api?.abbreviation,
            ...getRequestServiceAttributes(this),
          },
        });

        (this as AWS.Request<any, any>).on("complete", (response) => {
          if (thisPlugin.activeRequests.has(this)) {
            thisPlugin.activeRequests.delete(this);
          }
          if (!span) return;

          if (response.error) {
            span.setAttribute(AttributeNames.AWS_ERROR, response.error);
          }

          span.setAttributes({
            [AttributeNames.AWS_REQUEST_ID]: response.requestId,
            ...getResponseServiceAttributes(response),
          });
          span.end();
          span = null;
        });
      }

      const awsRequest = this;
      return thisPlugin._tracer.withSpan(span, () => {
        return original.apply(awsRequest, arguments);
      });
    };
  };

  private _getSpanName = (request: any) => {
    return `aws.${request.service?.serviceIdentifier ?? "request"}.${
      request.operation
    }`;
  };
}

export const plugin = new AwsPlugin("aws-sdk");
