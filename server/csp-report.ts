/**
 * server/csp-report.ts
 *
 * Development-only CSP violation reporting endpoint (POST /__csp-violation).
 * Browsers send a report here whenever the Content-Security-Policy blocks something,
 * so CSP problems show up in the dev server log before they reach production.
 *
 * The rate limit runs first, then the route's own JSON parser, so malformed and
 * oversized reports count toward the limit too. Every report that reaches the handler
 * is answered 204 No Content; a body that is not valid JSON, or is larger than 16 KB,
 * gets 400, 413 or 415 with the JSON error body from errorHandler (server/app.ts).
 */

import express, { type Express, type Request, type Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { cspViolationReportSchema } from "./csp-config";
import { logger } from "./logger";

export function registerCspViolationEndpoint(app: Express): void {
  // Rate limit CSP violation reports to prevent log flooding attacks.
  // With report-uri a browser sends one request per violation, so a broken policy on
  // a busy page can send many; legitimate violations are otherwise rare.
  const cspViolationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // limit each IP to 100 reports per window
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Count all requests, even successful ones
    // Past the limit, reports are dropped unlogged but still acknowledged with 204,
    // like every other report (browsers ignore the response anyway)
    handler: (_req, res) => { res.status(204).end(); },
    // Custom key generator: handle undefined IPs gracefully and normalize IPv6
    // When trust proxy = false, req.ip may be undefined for some connections
    keyGenerator: (req) => req.ip ? ipKeyGenerator(req.ip) : 'localhost-dev',
  });

  // Browsers send report-uri reports as application/csp-report
  const parseReport = express.json({ type: ['application/csp-report', 'application/json'], limit: '16kb' });

  // Limiter before parser: a malformed report still uses up the quota
  app.post('/__csp-violation', cspViolationLimiter, parseReport, (req: Request, res: Response) => {
    try {
      // Validate the wrapper structure (browsers send { "csp-report": {...} })
      const validationResult = cspViolationReportSchema.safeParse(req.body);

      if (!validationResult.success) {
        // Log validation error with details for debugging (development only)
        // Guard against null/primitive req.body values (express.json() can parse "null" as null)
        const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
        logger.warn('Invalid CSP violation report received', {
          error: 'Request body does not match CSP violation report schema',
          issues: validationResult.error.issues.length,
          bodyKeys,
          bodyType: typeof req.body,
          contentType: req.get('content-type'),
          firstIssue: validationResult.error.issues[0],
        });
        // Return 204 No Content regardless (don't leak schema info to potential attackers)
        res.status(204).end();
        return;
      }

      // Extract the actual violation data from the csp-report wrapper
      const violation = validationResult.data['csp-report'];

      // Only log if we have actual violation data (at least one expected field)
      if (violation && (violation['blocked-uri'] || violation['effective-directive'] || violation['violated-directive'])) {
        logger.warn('CSP Violation Detected in Development', {
          blockedUri: violation['blocked-uri'],
          effectiveDirective: violation['effective-directive'],
          violatedDirective: violation['violated-directive'],
          scriptSample: violation['script-sample'],
          originalPolicy: violation['original-policy'],
          sourceFile: violation['source-file'],
          lineNumber: violation['line-number'],
          columnNumber: violation['column-number'],
          documentUri: violation['document-uri'],
          disposition: violation.disposition,
        });
      } else {
        // Empty or minimal report - still log but at debug level
        logger.debug('CSP violation report received with minimal data', {
          bodyFields: Object.keys(req.body).length,
        });
      }
    } catch (error) {
      // Handle unexpected errors gracefully
      logger.error('Error processing CSP violation report', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Acknowledge with 204 No Content. Browsers ignore the response (the CSP spec
    // defines none), and an empty answer exposes nothing about validation.
    res.status(204).end();
  });
}
