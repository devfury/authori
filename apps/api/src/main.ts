import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

function parseCorsOrigins(raw: string): string[] | true {
  if (raw.trim() === '*') return true;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * API_PREFIX는 라우팅에만 적용되고 issuer 식별자(JWT_ISSUER)에는 자동 반영되지
 * 않는다. 둘의 prefix가 어긋나면 discovery 문서의 엔드포인트 URL이 실제 라우팅과
 * 불일치하여 클라이언트가 404를 만난다. 부팅 시 드리프트를 경고한다.
 */
function assertIssuerMatchesPrefix(prefix: string): void {
  const jwtIssuer = process.env.JWT_ISSUER ?? 'https://auth.example.com';
  let pathname: string;
  try {
    pathname = new URL(jwtIssuer).pathname.replace(/\/$/, '');
  } catch {
    Logger.warn(`JWT_ISSUER(${jwtIssuer})가 유효한 URL이 아닙니다.`, 'Bootstrap');
    return;
  }
  if (!pathname.endsWith(`/${prefix}`)) {
    Logger.warn(
      `JWT_ISSUER(${jwtIssuer})가 API_PREFIX(/${prefix})로 끝나지 않습니다. ` +
        `discovery 문서의 엔드포인트 URL이 실제 라우팅과 불일치할 수 있습니다.`,
      'Bootstrap',
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS ?? '');

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const prefix = process.env.API_PREFIX ?? '';
  if (prefix) {
    app.setGlobalPrefix(prefix);
    assertIssuerMatchesPrefix(prefix);
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Authori')
      .setDescription('OAuth2/OIDC 멀티테넌트 인증 플랫폼 API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addBasicAuth({ type: 'http', scheme: 'basic' }, 'ClientBasicAuth')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    const swaggerPath = `${prefix ? prefix + '/' : ''}docs`;
    SwaggerModule.setup(swaggerPath, app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
