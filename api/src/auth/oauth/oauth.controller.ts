import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { RateLimiter } from '../lookup.service';
import { KeysService } from './keys.service';
import {
  OAuthRedirectError,
  OAuthService,
  OAuthTokenError,
  type AuthorizeRequest,
  type TokenRequest,
} from './oauth.service';

function clientKey(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (first?.trim() || req.ip || req.socket?.remoteAddress) ?? 'unknown';
}

/**
 * Activate's OAuth 2.1 endpoints (OIDC mode). Served outside the /api prefix. The whole
 * controller answers 404 when AUTH_PROVIDER is not oidc, so WorkOS deployments expose
 * nothing here.
 */
@ApiExcludeController()
@Public()
@Controller('oauth')
export class OAuthController {
  private readonly tokenLimiter = new RateLimiter(120, 60_000);
  private readonly registerLimiter = new RateLimiter(20, 60_000);

  constructor(
    private readonly oauth: OAuthService,
    private readonly keys: KeysService,
  ) {}

  private assertEnabled() {
    if (!this.oauth.enabled) throw new NotFoundException();
  }

  @Get('authorize')
  async authorize(@Query() query: AuthorizeRequest, @Res() res: Response) {
    this.assertEnabled();
    try {
      const url = await this.oauth.authorize(query);
      res.redirect(302, url);
    } catch (e) {
      if (e instanceof OAuthRedirectError) return res.redirect(302, e.toUrl());
      throw e;
    }
  }

  @Get('callback')
  async callback(@Query() query: Record<string, string>, @Res() res: Response) {
    this.assertEnabled();
    try {
      const url = await this.oauth.callback(query);
      res.redirect(302, url);
    } catch (e) {
      if (e instanceof OAuthRedirectError) return res.redirect(302, e.toUrl());
      throw e;
    }
  }

  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async token(
    @Body() body: TokenRequest,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
  ) {
    this.assertEnabled();
    if (!this.tokenLimiter.take(clientKey(req)))
      throw new HttpException(
        { error: 'slow_down', error_description: 'too many token requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    try {
      return await this.oauth.token(body ?? {}, authorization);
    } catch (e) {
      if (e instanceof OAuthTokenError)
        throw new HttpException(e.body(), e.status);
      throw e;
    }
  }

  @Post('revoke')
  @HttpCode(200)
  async revoke(
    @Body() body: TokenRequest & { token?: string },
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.assertEnabled();
    await this.oauth.revoke(body?.token, body ?? {}, authorization);
    return {};
  }

  @Post('register')
  @HttpCode(201)
  async register(@Body() body: Record<string, unknown>, @Req() req: Request) {
    this.assertEnabled();
    if (!this.registerLimiter.take(clientKey(req)))
      throw new HttpException(
        { error: 'slow_down', error_description: 'too many registrations' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (!body || typeof body !== 'object')
      throw new BadRequestException('JSON body required');
    try {
      return await this.oauth.register(body);
    } catch (e) {
      if (e instanceof OAuthTokenError)
        throw new HttpException(e.body(), e.status);
      throw e;
    }
  }

  @Get('jwks')
  @Header('Cache-Control', 'public, max-age=300')
  async jwks() {
    this.assertEnabled();
    return this.keys.publicJwks();
  }
}
