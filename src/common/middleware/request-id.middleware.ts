import { Request, Response, NextFunction } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    (req.headers['x-request-id'] as string) ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
