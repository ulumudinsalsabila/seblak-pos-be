import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser } from '../common/auth-user';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginRateLimitGuard } from '../common/login-rate-limit.guard';

const COOKIE = 'seblak_refresh';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @UseGuards(LoginRateLimitGuard)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(dto);
    this.setCookie(response, session.refreshToken);
    return {
      data: { accessToken: session.accessToken, expiresIn: session.expiresIn },
      meta: null,
    };
  }

  @Post('refresh')
  @UseGuards(LoginRateLimitGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.refresh(
      request.cookies?.[COOKIE] as string | undefined,
    );
    this.setCookie(response, session.refreshToken);
    return {
      data: { accessToken: session.accessToken, expiresIn: session.expiresIn },
      meta: null,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.cookies?.[COOKIE] as string | undefined);
    response.clearCookie(COOKIE, { path: '/api/v1/auth' });
    return { data: { success: true }, meta: null };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { data: user, meta: null };
  }

  private setCookie(response: Response, token: string) {
    response.cookie(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
