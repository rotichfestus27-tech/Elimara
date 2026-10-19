import type { CookieOptions, Response } from "express";
import type { AppConfig } from "../../config/env.js";

export function setSessionCookies(
  response: Response,
  config: AppConfig,
  sessionToken: string,
  csrfToken: string,
): void {
  const common: CookieOptions = {
    secure: config.NODE_ENV === "production" || config.COOKIE_SAME_SITE === "none",
    sameSite: config.COOKIE_SAME_SITE,
    domain: config.COOKIE_DOMAIN,
    path: "/",
  };

  response.cookie(config.SESSION_COOKIE_NAME, sessionToken, {
    ...common,
    httpOnly: true,
    maxAge: config.SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
  response.cookie(config.CSRF_COOKIE_NAME, csrfToken, {
    ...common,
    httpOnly: false,
    maxAge: config.SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(response: Response, config: AppConfig): void {
  const common: CookieOptions = {
    secure: config.NODE_ENV === "production" || config.COOKIE_SAME_SITE === "none",
    sameSite: config.COOKIE_SAME_SITE,
    domain: config.COOKIE_DOMAIN,
    path: "/",
  };

  response.clearCookie(config.SESSION_COOKIE_NAME, { ...common, httpOnly: true });
  response.clearCookie(config.CSRF_COOKIE_NAME, { ...common, httpOnly: false });
}
