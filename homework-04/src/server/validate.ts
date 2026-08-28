import Ajv, { AnySchema } from 'ajv';
import { RequestHandler } from 'express';

const ajv = new Ajv();

/** Express middleware that validates `req.body` against a JSON schema. */
export function validate(schema: AnySchema): RequestHandler {
  const validateFn = ajv.compile(schema);
  return (req, res, next) => {
    if (validateFn(req.body)) {
      return next();
    }
    return res.status(400).send(validateFn.errors?.[0]);
  };
}
