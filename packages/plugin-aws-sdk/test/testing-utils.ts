import AWS from "aws-sdk";

export const mockAwsSend = (sendResult: any, data: any = undefined) => {
  AWS.Request.prototype.send = function (cb?: (error, response) => void) {
    if (cb) {
      (this as AWS.Request<any, any>).on("complete", (response) => {
        cb(response.error, response);
      });
    }
    const response = {
      ...sendResult,
      data,
      request: this,
    };
    setImmediate(() => {
      this._events.complete.forEach((handler) => handler(response));
    });
    return response;
  };

  AWS.Request.prototype.promise = function () {
    const response = {
      ...sendResult,
      data,
      request: this,
    };
    setImmediate(() => {
      this._events.complete.forEach((handler) => handler(response));
    });
    return new Promise((resolve) =>
      setImmediate(() => {
        resolve(data);
      })
    );
  };
};
