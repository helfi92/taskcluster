let uuid = require('uuid');
let debug = require('debug')('base:api');

const ERROR_CODES = {
  MalformedPayload:         400,  // Only for JSON.parse() errors
  InvalidRequestArguments:  400,  // Only for query and param validation errors
  InputValidationError:     400,  // Only for JSON schema errors
  AuthenticationFailed:     401,  // Only if authentication failed
  InsufficientScopes:       403,  // Only if request had insufficient scopes
  ResourceNotFound:         404,  // If the resource wasn't found
  RequestConflict:          409,  // If the request conflicts with server state
  ResourceExpired:          410,  // If the resource expired over time
  InputTooLarge:            413,  // Only if the payload is too big
  InternalServerError:      500,  // Only for internal errors
};

// Export ERROR_CODES
exports.ERROR_CODES = ERROR_CODES;

/**
 * Middleware that adds `res.reportError(code, message, details)` and
 * `res.reportInternalError(error)`.
 *
 * The `method` is the name of the API method, `errorCodes` is a mapping from
 * allowed error codes to HTTP status codes, and `raven` is an instance of
 * `raven.Client` from the `raven` npm module.
 */
let BuildReportErrorMethod = (method, errorCodes, raven = null) => {
  return (req, res, next) => {
    res.reportError = (code, message, details = {}) => {
      let status = errorCodes[code];
      if (status === undefined || typeof(message) !== 'string') {
        message = 'Internal error, unknown error code: ' + code + '\n' +
                  (message || 'Missing message!');
        code = 'InternalServerError';
        status = 500;
        if (raven) {
          let err = new Error(message)
          err.badMessage = message;
          err.badCode = code;
          err.details = details;
          raven.captureError(err, {level: 'error'});
        }
      }
      let requestInfo = {
        method,
        params:  req.params,
        payload: req.body,
        time:    (new Date()).toJSON(),
      };
      message = message.replace(/{{([a-zA-Z0-9_-]+)}}/g, (text, key) => {
        let value = details.hasOwnProperty(key) ? details[key] : text;
        if (typeof(value) !== 'string') {
          return JSON.stringify(value, null, 2);
        }
        return value;
      }) + [
        '\n----',
        'errorCode:  ' + code,
        'statusCode: ' + status,
        'requestInfo:',
        '  method:   ' + requestInfo.method,
        '  params:   ' + JSON.stringify(requestInfo.params),
        '  payload:  ' + JSON.stringify(requestInfo.payload, null, 2),
        '  time:     ' + requestInfo.time,
        'details:',
        JSON.stringify(details, null, 2),
      ].join('\n');
      res.status(status).json({code, message, requestInfo, details});
    };
    res.reportInternalError = (err) => {
      let incidentId = uuid.v4();
      res.reportError(
        'InternalServerError',
        'Internal Server Error, incidentId: ' + incidentId,
        {incidentId}
      );
      debug(
        "Error occurred handling: %s, err: %s, as JSON: %j, incidentId: %s",
        req.url, err, err, incidentId, err.stack
      );
      if (raven) {
        err.incidentId = incidentId;
        raven.captureError(err, {level: 'error'});
      }
    };
    next();
  };
};

// Export BuildReportErrorMethod
exports.BuildReportErrorMethod = BuildReportErrorMethod;
