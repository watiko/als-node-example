import { AsyncLocalStorage, AsyncResource } from "async_hooks";
import { IncomingMessage, ServerResponse } from "http";
import Fastify from "fastify";
import middle from "middie";
import { v4 as uuid } from "uuid";

type NextHandleFunction = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
) => void;

type RequestContextValue = {
  requestId: string;
};

const requestContext = new AsyncLocalStorage<RequestContextValue>();

function logger(payload: {
  level: "DEBUG" | "INFO" | "ERROR";
  message: string;
  meta?: unknown;
}): void {
  const requestId = requestContext.getStore()?.requestId;

  const log = JSON.stringify({ requestId, ...payload });
  console.log(log);
}

function requestIdMiddleware(): NextHandleFunction {
  return function (_req, _res, next) {
    const requestId = uuid();
    requestContext.run(
      {
        requestId,
      },
      () => {
        logger({
          level: "DEBUG",
          message: `generate requestId`,
        });
        next();
      }
    );
  };
}

function accessLoggerMiddleware(): NextHandleFunction {
  return function (req, res, next) {
    const start = new Date();
    const getResponseTime = () => new Date().getTime() - start.getTime();

    logger({
      level: "INFO",
      message: "req:start",
      meta: {
        req: {
          method: req.method,
          url: req.url,
        },
      },
    });

    res.on(
      "finish",
      AsyncResource.bind(() => {
        logger({
          level: "INFO",
          message: "req:end",
          meta: {
            res: {
              statusCode: res.statusCode,
            },
            responseTime: getResponseTime(),
          },
        });
      })
    );

    res.on(
      "error",
      AsyncResource.bind(() => {
        logger({
          level: "ERROR",
          message: "req:error",
        });
      })
    );

    next();
  };
}

async function build() {
  const fastify = Fastify();
  await fastify.register(middle);

  fastify.use(requestIdMiddleware());
  fastify.use(accessLoggerMiddleware());

  fastify.get("/", async (_req, _res) => {
    const requestId = requestContext.getStore()?.requestId;
    logger({
      level: "INFO",
      message: "got request with /",
    });

    return {
      requestId,
    };
  });

  return fastify;
}

build()
  .then((fastify) => fastify.listen(3000))
  .catch(console.log);
